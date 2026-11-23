import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  use,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { ApiError } from '../../lib/api';
import { claudeStatusQuery } from '../../lib/queries';
import {
  connectionButtons,
  connectionState,
  connectionText,
  loadQueue,
  newPromptId,
  outputFrameUrl,
  pruneQueue,
  rememberMode,
  storedMode,
  toQueued,
  type ChatEntry,
  type ClaudeInfo,
  type ConnectionButtons,
  type ConnectionState,
  type Launch,
  type OutputInfo,
  type Presence,
  type QueuedPrompt,
  type SessionPage,
  type WorkflowView,
  LOG_TAG,
  saveQueue,
} from '../../lib/session';
import { createLiveStore, type LiveState } from '../../lib/session-live';
import { initialUi, uiReducer, type UiState } from '../../lib/session-ui';
import {
  changedBlocks,
  frameMessage,
  postToFrame,
  requestSnapshot,
  resolveSnapshot,
  scrollOf,
  snapshotFor,
} from '../../lib/snapshot';
import { useSecondClock, useWindowEvent } from '../../lib/subscribe';
import type { Stage } from '../../lib/types';
import { action, type SessionAction, type SessionResult } from '../../routes/session';

/** Everything the panel components read and do. One place holds the page's state, so the parts stay presentational. */
export type SessionController = {
  page: SessionPage;
  key: string;
  ended: boolean;
  endedBy: string | null;
  chat: ChatEntry[];
  queue: QueuedPrompt[];
  ui: UiState;
  annotate: boolean;
  stage: Stage | null;
  stageSource: string | null;
  workflow: WorkflowView | null;
  nextStage: LiveState['nextStage'];
  outputs: OutputInfo[];
  currentOutput: string;
  latestRevision: number;
  updatedOutputs: Record<string, boolean>;
  presence: Presence;
  claudeSessionId: string;
  claudeInfo: ClaudeInfo | null;
  connection: {
    state: ConnectionState;
    text: string;
    buttons: ConnectionButtons;
    launch: Launch | null;
    now: number;
  };
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameSrc: string;
  frameReloads: number;
  sentLogRefs: Set<string>;
  hint: (text: string, error?: boolean) => void;
  run: (input: SessionAction) => Promise<SessionResult>;
  enqueue: (raw: unknown) => void;
  removeQueued: (id: string) => void;
  send: (typed: string, end: boolean) => Promise<void>;
  sendEntry: (prompt: QueuedPrompt) => Promise<boolean>;
  endSession: () => Promise<void>;
  restart: (path: 'new-session' | 'reopen') => Promise<void>;
  setStage: (stage: Stage | null) => Promise<void>;
  toggleAnnotate: () => void;
  selectOutput: (id: string) => void;
  connect: (resume: boolean) => Promise<boolean>;
  connectNext: (key: string) => Promise<void>;
  cancelConnect: () => Promise<void>;
  showRevision: (n: number) => Promise<void>;
  showLatest: () => void;
  selectTab: (tab: 'chat' | 'log') => void;
  markEnded: (by: string | null) => void;
  push: (msg: unknown) => void;
};

export const SessionContext = createContext<SessionController | null>(null);

export function useSessionContext(): SessionController {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('SessionContext is missing');
  return ctx;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const unreachable = (e: unknown): string => `Could not reach see-plan: ${message(e)}`;

/** What the frame needs to be told each time it loads, and what to remember between loads. Not shown, so not state. */
type FrameMemory = {
  loads: number;
  lastScroll: { x: number; y: number } | null;
  last: { output: string; snapshot: string } | null;
  snapshots: Record<string, string>;
};

export function useSession(page: SessionPage, baseUrl: string): SessionController {
  const key = page.key;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const memory = useRef<FrameMemory>({ loads: 0, lastScroll: null, last: null, snapshots: {} });
  const [ui, dispatch] = useReducer(uiReducer, undefined, () =>
    initialUi(pruneQueue(loadQueue(key), page.chat), storedMode(key, 'main') ?? true),
  );
  const queueRef = useRef(ui.queue);

  const hint = (text: string, error = false): void => dispatch({ type: 'hint', text, error });

  const [store] = useState(() =>
    createLiveStore(key, { workflow: page.workflow, baseUrl }, (msg, state) => {
      const type = (msg as { type?: unknown } | null)?.type;
      if (type === 'ended') {
        postToFrame(frameRef.current, { type: 'setMode', annotate: false });
        postToFrame(frameRef.current, { type: 'ended' });
        dispatch({ type: 'launch', launch: null });
        dispatch({ type: 'hint', text: '' });
      } else if (type === 'presence' && (state.presence.listening || state.presence.working)) {
        dispatch({ type: 'launch', launch: null });
      } else if (type === 'outputs' && state.added.length) {
        dispatch({ type: 'hint', text: `Added: ${state.added.join(', ')}` });
      }
    }),
  );
  const live = useSyncExternalStore(store.subscribe, store.get, () => store.get());
  const { data: claudeInfo = null } = useQuery(claudeStatusQuery(key));

  const ended = page.status === 'ended' || live.ended !== null;
  const endedBy = live.ended ? live.ended.by : page.ended_by;
  const chat = live.chat ?? page.chat;
  const queue = pruneQueue(ui.queue, chat);
  const outputs = live.outputs ?? page.outputs;
  const currentOutput = outputs.some((o) => o.id === ui.currentOutput) ? ui.currentOutput : 'main';
  const revisionOf = (o: OutputInfo): number => live.revisions[o.id] ?? o.revision;
  const shown = outputs.find((o) => o.id === currentOutput) ?? outputs[0];
  const latestRevision = shown ? revisionOf(shown) : page.revision;
  const updatedOutputs: Record<string, boolean> = {};
  for (const o of outputs) {
    if (o.id !== currentOutput && revisionOf(o) !== (ui.seen[o.id] ?? o.revision))
      updatedOutputs[o.id] = true;
  }
  const annotate = !ended && ui.annotate;
  const stage = live.stage ? live.stage.stage : page.stage;
  const stageSource = live.stage ? live.stage.source : page.stage_source;
  const workflow = live.workflow ?? page.workflow;
  const claudeSessionId = live.claudeSessionId ?? page.claude_session_id ?? '';

  const launching = ui.launch !== null && ui.launch.mode !== 'copy';
  const ticked = useSecondClock(launching);
  const now = ticked || Date.now();
  const state = ended ? 'ended' : connectionState(live.presence, ui.launch, claudeInfo, now);

  const sentLogRefs = new Set(
    chat
      .map((e) => e.prompt_id)
      .filter((id): id is string => typeof id === 'string' && id.startsWith(`${LOG_TAG}:`)),
  );

  const run = (input: SessionAction): Promise<SessionResult> => action(input);

  /** Writes the unsent notes to the page and to storage together; works from the latest list, not a stale one. */
  const setQueue = (change: (q: QueuedPrompt[]) => QueuedPrompt[]): QueuedPrompt[] => {
    const next = change(pruneQueue(queueRef.current, store.get().chat ?? page.chat));
    queueRef.current = next;
    saveQueue(key, next);
    dispatch({ type: 'queue', queue: next });
    return next;
  };

  const enqueue = (raw: unknown): void => {
    if (ended) return hint('Session ended — new notes are not sent.', true);
    const item = toQueued(raw, currentOutput);
    if (item) setQueue((q) => [...q, item]);
  };

  const setMode = (on: boolean): void => {
    rememberMode(key, currentOutput, on);
    postToFrame(frameRef.current, { type: 'setMode', annotate: on });
    dispatch({ type: 'annotate', on });
  };

  const onFrameReady = (): void => {
    const mem = memory.current;
    mem.loads += 1;
    const stored = storedMode(key, currentOutput);
    if (ended) {
      postToFrame(frameRef.current, { type: 'setMode', annotate: false });
      postToFrame(frameRef.current, { type: 'ended' });
    } else if (mem.loads > 1 || stored !== null) {
      if (stored !== null) dispatch({ type: 'annotate', on: stored });
      postToFrame(frameRef.current, { type: 'setMode', annotate: stored ?? ui.annotate });
    }
    const before = mem.last && mem.last.output === currentOutput ? mem.last.snapshot : '';
    if (before && mem.lastScroll) {
      postToFrame(frameRef.current, { type: 'restoreScroll', ...mem.lastScroll });
    }
    const output = currentOutput;
    void requestSnapshot(frameRef.current).then((html) => {
      if (before && html) {
        const added = changedBlocks(before, html);
        if (added.length) postToFrame(frameRef.current, { type: 'highlightChanges', added });
      }
      if (html) {
        mem.last = { output, snapshot: html };
        mem.snapshots[output] = html;
      }
    });
  };

  // The frame's messages: the check that they come from the frame's own window is in frameMessage.
  useWindowEvent('message', (event) => {
    const data = frameMessage(event, frameRef.current);
    if (!data) return;
    switch (data.type) {
      case 'queuePrompt':
        enqueue(data.prompt);
        break;
      case 'snapshot':
        resolveSnapshot(data.id, data.html);
        break;
      case 'scroll':
        memory.current.lastScroll = scrollOf(data) ?? memory.current.lastScroll;
        break;
      case 'mode':
        if (!ended) {
          dispatch({ type: 'annotate', on: Boolean(data.annotate) });
          if (data.user) rememberMode(key, currentOutput, Boolean(data.annotate));
        }
        break;
      case 'ready':
        onFrameReady();
        break;
    }
  });

  const markEnded = (by: string | null): void => store.push({ type: 'ended', ended_by: by });

  const send = async (typed: string, end: boolean): Promise<void> => {
    if (ended || ui.sending) return;
    const text = typed.trim();
    if (text) {
      setQueue((q) => [
        ...q,
        { prompt_id: newPromptId(), prompt: text, tag: 'chat', selector: '', text: '' },
      ]);
    }
    const batch = queueRef.current;
    if (!batch.length && !end) return hint('Nothing to send yet: click the page or type a message.');
    dispatch({ type: 'sending', on: true });
    hint('Sending…');
    try {
      const snapshot = await requestSnapshot(frameRef.current);
      if (snapshot) memory.current.snapshots[currentOutput] = snapshot;
      const domSnapshot = snapshotFor(outputs.length, batch, memory.current.snapshots, snapshot);
      const res = await run({ intent: 'send', key, prompts: batch, domSnapshot, end });
      const accepted = res.chat ?? [];
      store.push({ type: 'chat', chat: accepted });
      setQueue((q) => pruneQueue(q, accepted));
      hint(batch.length ? sentHint(res.delivered) : '');
      if (end) markEnded('user');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'ENDED') markEnded(null);
      else hint(e instanceof ApiError ? e.message : unreachable(e), true);
    } finally {
      dispatch({ type: 'sending', on: false });
    }
  };

  /** A note about one Claude log entry goes straight to the agent. True when it was accepted. */
  const sendEntry = async (prompt: QueuedPrompt): Promise<boolean> => {
    try {
      const res = await run({ intent: 'send', key, prompts: [prompt], domSnapshot: '', end: false });
      store.push({ type: 'chat', chat: res.chat ?? [] });
      hint(sentHint(res.delivered));
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'ENDED') markEnded(null);
      hint(e instanceof ApiError ? e.message : unreachable(e), true);
      return false;
    }
  };

  const endSession = async (): Promise<void> => {
    if (ended || ui.sending) return;
    dispatch({ type: 'sending', on: true });
    try {
      await run({ intent: 'end', key });
      markEnded('user');
    } catch (e) {
      hint(e instanceof ApiError ? e.message : unreachable(e), true);
    } finally {
      dispatch({ type: 'sending', on: false });
    }
  };

  const restart = async (path: 'new-session' | 'reopen'): Promise<void> => {
    try {
      await run({ intent: 'restart', key, path });
      window.location.reload(); // a new round: read the session again
    } catch (e) {
      hint(e instanceof ApiError ? e.message : unreachable(e), true);
    }
  };

  const setStage = async (next: Stage | null): Promise<void> => {
    try {
      const res = await run({ intent: 'stage', key, stage: next });
      store.push({ type: 'stage', stage: res.stage ?? null, source: res.stageSource ?? null });
    } catch (e) {
      hint(e instanceof ApiError ? e.message : 'Could not reach see-plan.', true);
    }
  };

  const toggleAnnotate = (): void => {
    if (!ended) setMode(!ui.annotate);
  };

  const selectOutput = (id: string): void => {
    const o = outputs.find((out) => out.id === id);
    if (!o || (id === currentOutput && !ui.viewing)) return;
    memory.current.lastScroll = null; // another file: nothing to restore, nothing to compare with
    memory.current.last = null;
    const mode = storedMode(key, id);
    dispatch({ type: 'output', id, revision: revisionOf(o), annotate: ended ? false : (mode ?? true) });
  };

  const connectWith = async (resume: boolean, targetKey: string): Promise<boolean> => {
    try {
      const res = await run({ intent: 'connect', key: targetKey, resume });
      if (targetKey === key) {
        const body = res.body ?? {};
        const mode = typeof body.mode === 'string' ? body.mode : 'powershell';
        const reasons = Array.isArray(body.strategy_reasons)
          ? body.strategy_reasons.filter((r): r is string => typeof r === 'string')
          : [];
        dispatch({
          type: 'launch',
          launch: {
            at: Date.now(),
            mode,
            command: typeof body.command === 'string' ? body.command : '',
            strategy: typeof body.strategy === 'string' ? body.strategy : mode,
            reasons,
            tmux_window: typeof body.tmux_window === 'string' ? body.tmux_window : '',
          },
        });
        if (typeof body.claude_session_id === 'string') {
          store.push({ type: 'claude-session', id: body.claude_session_id });
        }
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'AGENT_RECONNECTING' || e.code === 'LISTENER_ACTIVE')) {
        hint('An agent is already connected.');
      } else {
        hint(e instanceof ApiError ? e.message : unreachable(e), true);
      }
      return false;
    }
  };

  const cancelConnect = async (): Promise<void> => {
    dispatch({ type: 'launch', launch: null });
    await run({ intent: 'connect-cancel', key }).catch(() => undefined);
  };

  const showRevision = async (n: number): Promise<void> => {
    try {
      const res = await run({ intent: 'revision', key, output: currentOutput, n });
      if (typeof res.html !== 'string') return hint('That revision is gone.', true);
      dispatch({ type: 'viewing', viewing: { n, html: res.html, latest: latestRevision } });
    } catch {
      hint('Could not load that revision.', true);
    }
  };

  const base = `${outputFrameUrl(page.artifact_base, currentOutput, latestRevision)}`;

  return {
    page,
    key,
    ended,
    endedBy,
    chat,
    queue,
    ui,
    annotate,
    stage,
    stageSource,
    workflow,
    nextStage: live.nextStage,
    outputs,
    currentOutput,
    latestRevision,
    updatedOutputs,
    presence: live.presence,
    claudeSessionId,
    claudeInfo,
    connection: {
      state,
      text: connectionText(state, live.presence, ui.launch, claudeInfo, now),
      buttons: connectionButtons(state, ui.launch, claudeInfo, page.can_resume, Boolean(claudeSessionId)),
      launch: ui.launch,
      now,
    },
    frameRef,
    frameSrc: base,
    frameReloads: live.reloads[currentOutput] ?? 0,
    sentLogRefs,
    hint,
    run,
    enqueue,
    removeQueued: (id) => void setQueue((q) => q.filter((p) => p.prompt_id !== id)),
    send,
    sendEntry,
    endSession,
    restart,
    setStage,
    toggleAnnotate,
    selectOutput,
    connect: (resume) => connectWith(resume, key),
    connectNext: async (nextKey) => {
      await connectWith(false, nextKey);
    },
    cancelConnect,
    showRevision,
    showLatest: () => dispatch({ type: 'viewing', viewing: null }),
    selectTab: (tab) => dispatch({ type: 'tab', tab }),
    markEnded,
    push: store.push,
  };
}

export const sentHint = (delivered: string | undefined): string =>
  delivered === 'queued-for-agent' ? 'Sent.' : 'Queued. The agent gets it when it connects.';
