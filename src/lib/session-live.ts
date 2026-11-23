import {
  isStage,
  parseWorkflow,
  type ChatEntry,
  type NextStage,
  type OutputInfo,
  type Presence,
  type WorkflowView,
} from './session';
import type { Stage } from './types';

/**
 * Live changes to the review page, from /events/:key and from the page's own actions, as an external store.
 * useSyncExternalStore subscribes and unsubscribes for us, so no effect hook (FE-10). The socket opens with the first
 * listener and closes shortly after the last. Components read `live.x ?? loaderData.x`.
 */

export type LiveState = {
  chat: ChatEntry[] | null;
  presence: Presence;
  outputs: OutputInfo[] | null;
  added: string[];
  /** The newest revision announced for each output id. */
  revisions: Record<string, number>;
  /** Bumped when the server asks an output to reload, so the frame is loaded again. */
  reloads: Record<string, number>;
  ended: { by: string | null } | null;
  stage: { stage: Stage | null; source: string | null } | null;
  workflow: WorkflowView | null;
  nextStage: NextStage | null;
  claudeSessionId: string | null;
};

export type LiveBase = { workflow: WorkflowView | null; baseUrl: string };

const noPresence: Presence = {
  listening: false,
  working: false,
  agent: null,
  session_id: null,
  last_poll_at: null,
};

export const initialLive: LiveState = {
  chat: null,
  presence: noPresence,
  outputs: null,
  added: [],
  revisions: {},
  reloads: {},
  ended: null,
  stage: null,
  workflow: null,
  nextStage: null,
  claudeSessionId: null,
};

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function parseOutputs(raw: unknown): OutputInfo[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw
    .filter(isRecord)
    .filter((o) => typeof o.id === 'string')
    .map((o) => ({
      id: String(o.id),
      file: String(o.file ?? ''),
      kind: String(o.kind ?? 'html'),
      revision: Number(o.revision) || 0,
    }));
  return list.length ? list : null;
}

/** Folds one message into the live state. Unknown or malformed messages change nothing. */
export function applyEvent(prev: LiveState, msg: unknown, base: LiveBase): LiveState {
  if (!isRecord(msg)) return prev;
  switch (msg.type) {
    case 'chat':
      return Array.isArray(msg.chat) ? { ...prev, chat: msg.chat.filter(isRecord) } : prev;
    case 'presence':
      return {
        ...prev,
        presence: {
          listening: msg.listening === true,
          working: msg.listening !== true && msg.working === true,
          agent: text(msg.agent),
          session_id: text(msg.session_id),
          last_poll_at: text(msg.last_poll_at),
        },
      };
    case 'outputs': {
      const list = parseOutputs(msg.outputs);
      if (!list) return prev;
      const added = Array.isArray(msg.added)
        ? msg.added.filter((a): a is string => typeof a === 'string')
        : [];
      return { ...prev, outputs: list, added };
    }
    case 'reload':
    case 'revision': {
      const id = text(msg.output) ?? 'main';
      const revision = Number(msg.revision);
      if (!Number.isFinite(revision)) return prev;
      return {
        ...prev,
        revisions: { ...prev.revisions, [id]: revision },
        reloads:
          msg.type === 'reload' ? { ...prev.reloads, [id]: (prev.reloads[id] ?? 0) + 1 } : prev.reloads,
      };
    }
    case 'ended':
      return { ...prev, ended: { by: text(msg.ended_by) ?? text(msg.by) } };
    case 'claude-session':
      return text(msg.id) ? { ...prev, claudeSessionId: text(msg.id) } : prev;
    case 'stage':
      return { ...prev, stage: { stage: isStage(msg.stage) ? msg.stage : null, source: text(msg.source) } };
    case 'stage-ready': {
      const current = prev.workflow ?? base.workflow;
      const next = text(msg.next);
      let workflow = current;
      if (current && next && isStage(next)) {
        const known = current.stages[next];
        workflow = {
          ...current,
          current: next,
          stages: known
            ? {
                ...current.stages,
                [next]: { ...known, status: 'current', url: text(msg.next_url) ?? known.url },
              }
            : current.stages,
        };
      }
      return { ...prev, workflow, nextStage: nextStageOf(msg) };
    }
    case 'workflow': {
      // From the page's own actions (skip, decision): a workflow answer and maybe the next stage.
      const workflow = parseWorkflow(msg.workflow, base.baseUrl);
      return {
        ...prev,
        workflow: workflow ?? prev.workflow,
        nextStage: isRecord(msg.nextStage) ? nextStageOf(msg.nextStage) : prev.nextStage,
      };
    }
    default:
      return prev;
  }
}

function nextStageOf(msg: Record<string, unknown>): NextStage {
  return {
    from: text(msg.from),
    next: text(msg.next),
    next_url: text(msg.next_url),
    next_key: text(msg.next_key),
    skipped: msg.skipped === true,
    reopened: msg.reopened === true,
  };
}

const RECONNECT_DELAYS_MS = [1000, 2000, 5000];
const CLOSE_GRACE_MS = 100; // a re-render swaps the listener: do not drop the socket for it

export type LiveStore = {
  subscribe: (listener: () => void) => () => void;
  get: () => LiveState;
  push: (msg: unknown) => void;
};

/** `onEvent` sees every message after it is applied: the page uses it for what must happen once (tell the frame). */
export function createLiveStore(
  key: string,
  base: LiveBase,
  onEvent?: (msg: unknown, state: LiveState) => void,
): LiveStore {
  let state = initialLive;
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let closing: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  const listeners = new Set<() => void>();

  const push = (msg: unknown): void => {
    if (isRecord(msg) && msg.type === 'new-session') {
      window.location.reload();
      return;
    }
    const next = applyEvent(state, msg, base);
    if (next !== state) {
      state = next;
      for (const l of listeners) l();
    }
    onEvent?.(msg, state);
  };

  const connect = (): void => {
    reconnect = null;
    if (typeof WebSocket === 'undefined') return;
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${location.host}/events/${encodeURIComponent(key)}`);
    } catch {
      return schedule();
    }
    socket.addEventListener('open', () => {
      attempt = 0;
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        push(JSON.parse(String(event.data)));
      } catch {
        // not JSON: ignore it
      }
    });
    socket.addEventListener('close', () => {
      socket = null;
      if (listeners.size > 0) schedule();
    });
  };

  const schedule = (): void => {
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 5000;
    attempt += 1;
    reconnect = setTimeout(connect, delay);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (closing) clearTimeout(closing);
      closing = null;
      if (!socket && !reconnect) connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || closing) return;
        closing = setTimeout(() => {
          closing = null;
          if (listeners.size > 0) return;
          if (reconnect) clearTimeout(reconnect);
          reconnect = null;
          socket?.close();
          socket = null;
        }, CLOSE_GRACE_MS);
      };
    },
    get: () => state,
    push,
  };
}
