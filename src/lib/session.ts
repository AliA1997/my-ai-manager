import { STAGES, type Stage } from './types';
import { STAGE_TITLES } from './home';

/** Types and pure helpers for the review page (/session/:key). Kept out of the components so they are testable (FE-13). */

export const SOURCE = 'my-lavish';
export const LOG_TAG = 'claude-log';
export const ALLOW_RULE = '"Bash(see-plan:*)"';
export const STUCK_AFTER_MS = 45_000; // a launched Claude that has not polled by now needs the user's help
export const SESSION_KEY = /^[0-9a-f]{16}$/;

/** What the person can pick as having stood out in a session (the same ids src/stages.js accepts). */
export const FEEDBACK_CATEGORIES = [
  { value: 'wrong-direction', title: 'Wrong direction' },
  { value: 'too-slow', title: 'Too slow' },
  { value: 'broke-something', title: 'Broke something' },
  { value: 'ignored-notes', title: 'Ignored my notes' },
  { value: 'great-job', title: 'Great job' },
] as const;

export type ChatEntry = {
  role?: string;
  html?: string;
  text?: string;
  anchor?: string | null;
  at?: string | null;
  prompt_id?: string;
};
export type HistoryRound = { ended_at: string | null; ended_by: string | null; chat: ChatEntry[] };
export type OutputInfo = { id: string; file: string; kind: string; revision: number };
export type WorkflowStageView = { status: string; url: string | null; key: string | null };
export type WorkflowView = {
  id: string;
  name: string;
  current: Stage | null;
  stages: Partial<Record<Stage, WorkflowStageView>>;
};

/** What /api/:key/page answers: the session as the review page starts out. */
export type SessionPage = {
  key: string;
  file: string;
  status: string;
  ended_by: string | null;
  chat: ChatEntry[];
  claude_session_id: string | null;
  can_resume: boolean;
  stage: Stage | null;
  stage_source: string | null;
  has_plan: boolean;
  revision: number;
  decision: string | null;
  poll_command: string;
  history: HistoryRound[];
  workflow: WorkflowView | null;
  artifact_base: string;
  outputs: OutputInfo[];
};

export type QueuedPrompt = {
  prompt_id: string;
  prompt: string;
  tag: string;
  selector: string;
  text: string;
  output?: string;
  target?: unknown;
};

export type Presence = {
  listening: boolean;
  working: boolean;
  agent: string | null;
  session_id: string | null;
  last_poll_at: string | null;
};

export type Launch = {
  at: number;
  mode: string;
  command: string;
  strategy: string;
  reasons: string[];
  tmux_window: string;
};

export type ClaudeInfo = {
  launch: string;
  claude_found?: boolean;
  strategy_reasons?: string[];
};

export type ConnectionState =
  'connected' | 'working' | 'starting' | 'tmux' | 'stuck' | 'off' | 'unsupported' | 'idle' | 'ended';

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';

/** A link the server gave for the next stage: used only if it stays on this origin (SEC-12). */
export function sameOriginUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin ? parsed.href : null;
  } catch {
    return null;
  }
}

export const isStage = (v: unknown): v is Stage =>
  typeof v === 'string' && (STAGES as readonly string[]).includes(v);

export function errorMessage(body: unknown, status?: number): string {
  const err = isRecord(body) && isRecord(body.error) ? body.error : null;
  if (err && typeof err.message === 'string' && err.message) return err.message;
  if (err && typeof err.code === 'string' && err.code) return err.code;
  return `Request failed (HTTP ${status ?? 0})`;
}

export function errorCode(body: unknown): string {
  const err = isRecord(body) && isRecord(body.error) ? body.error : null;
  return err && typeof err.code === 'string' ? err.code : '';
}

const chatOf = (v: unknown): ChatEntry[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/** The page data is the server's answer, but it is checked before use (SEC-12). */
export function parsePage(raw: unknown): SessionPage {
  if (!isRecord(raw) || typeof raw.key !== 'string' || !SESSION_KEY.test(raw.key)) {
    throw new Error('unexpected session page');
  }
  const outputs = (Array.isArray(raw.outputs) ? raw.outputs : [])
    .filter(isRecord)
    .filter((o) => typeof o.id === 'string')
    .map((o) => ({
      id: String(o.id),
      file: String(o.file ?? ''),
      kind: String(o.kind ?? 'html'),
      revision: Number(o.revision) || 0,
    }));
  const revision = Number(raw.revision) || 0;
  return {
    key: raw.key,
    file: String(raw.file ?? ''),
    status: String(raw.status ?? 'open'),
    ended_by: typeof raw.ended_by === 'string' ? raw.ended_by : null,
    chat: chatOf(raw.chat),
    claude_session_id: typeof raw.claude_session_id === 'string' ? raw.claude_session_id : null,
    can_resume: raw.can_resume === true,
    stage: isStage(raw.stage) ? raw.stage : null,
    stage_source: typeof raw.stage_source === 'string' ? raw.stage_source : null,
    has_plan: raw.has_plan === true,
    revision,
    decision: typeof raw.decision === 'string' ? raw.decision : null,
    poll_command: String(raw.poll_command ?? ''),
    history: (Array.isArray(raw.history) ? raw.history : []).filter(isRecord).map((h) => ({
      ended_at: typeof h.ended_at === 'string' ? h.ended_at : null,
      ended_by: typeof h.ended_by === 'string' ? h.ended_by : null,
      chat: chatOf(h.chat),
    })),
    workflow: parseWorkflow(raw.workflow),
    artifact_base: typeof raw.artifact_base === 'string' ? raw.artifact_base : '',
    outputs: outputs.length ? outputs : [{ id: 'main', file: '', kind: 'html', revision }],
  };
}

/** A workflow from the page data or from an API answer; `base` builds the stage links the server omits. */
export function parseWorkflow(raw: unknown, base = ''): WorkflowView | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const stages: WorkflowView['stages'] = {};
  const given = isRecord(raw.stages) ? raw.stages : {};
  for (const s of STAGES) {
    const st = isRecord(given[s]) ? given[s] : {};
    const key = typeof st.key === 'string' ? st.key : null;
    stages[s] = {
      status: String(st.status ?? 'locked'),
      key,
      url: typeof st.url === 'string' ? st.url : key ? `${base}/session/${key}` : null,
    };
  }
  return {
    id: raw.id,
    name: String(raw.name ?? ''),
    current: isStage(raw.current) ? raw.current : null,
    stages,
  };
}

// ---- the unsent notes ------------------------------------------------------

export const queueStorageKey = (key: string): string => `my-lavish:queue:${key}`;

export const isQueuedPrompt = (p: unknown): p is QueuedPrompt =>
  isRecord(p) && typeof p.prompt_id === 'string' && typeof p.prompt === 'string';

/** localStorage: unsent notes survive closing the tab. Storage can be blocked; the page works without it. */
export function loadQueue(key: string): QueuedPrompt[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(queueStorageKey(key)) ?? '[]');
    return Array.isArray(saved) ? saved.filter(isQueuedPrompt) : [];
  } catch {
    return [];
  }
}

export function saveQueue(key: string, queue: readonly QueuedPrompt[]): void {
  try {
    if (queue.length) window.localStorage.setItem(queueStorageKey(key), JSON.stringify(queue));
    else window.localStorage.removeItem(queueStorageKey(key));
  } catch {
    // storage unavailable or full: keep the in-memory queue
  }
}

/** Notes the server already holds (they appear in the chat) are no longer unsent. */
export function pruneQueue(queue: readonly QueuedPrompt[], chat: readonly ChatEntry[]): QueuedPrompt[] {
  const accepted = new Set(chat.map((e) => e.prompt_id).filter((id): id is string => typeof id === 'string'));
  return queue.filter((q) => !accepted.has(q.prompt_id));
}

export function newPromptId(): string {
  return crypto.randomUUID();
}

/** A new queued note from what the frame sent (or what was typed); null when there is nothing to queue. */
export function toQueued(raw: unknown, output?: string): QueuedPrompt | null {
  if (!isRecord(raw) || typeof raw.prompt !== 'string' || !raw.prompt.trim()) return null;
  const item: QueuedPrompt = {
    prompt_id: newPromptId(),
    prompt: raw.prompt.trim(),
    tag: typeof raw.tag === 'string' ? raw.tag : '',
    selector: typeof raw.selector === 'string' ? raw.selector : '',
    text: typeof raw.text === 'string' ? raw.text : '',
  };
  if (output) item.output = output;
  if (isRecord(raw.target)) {
    try {
      item.target = JSON.parse(JSON.stringify(raw.target)) as unknown;
    } catch {
      // un-serializable target: send the prompt without it
    }
  }
  return item;
}

export function anchorLabel(p: Pick<QueuedPrompt, 'tag' | 'selector'>): string {
  if (p.tag === 'text') return 'text selection';
  if (p.tag === 'chat' || !p.tag) return '';
  if (p.tag === LOG_TAG) return 'Claude log entry';
  if (p.tag === 'plan') return 'Whole plan';
  return `${p.tag} ${p.selector || ''}`;
}

// ---- outputs and revisions -------------------------------------------------

export const fileName = (file: string): string => file.split(/[\\/]/).pop() ?? '';

/** The frame URL carries a capability (the frame is sandboxed, so it may not send the sign-in cookie). */
export function outputFrameUrl(base: string, id: string, revision: number): string {
  const path = id === 'main' ? '' : `/o/${encodeURIComponent(id)}`;
  return `${base}${path}/index.html?rev=${encodeURIComponent(String(revision))}`;
}

export const revisionQuery = (output: string): string =>
  output === 'main' ? '' : `?output=${encodeURIComponent(output)}`;

const modeKey = (key: string, id: string): string => `see-plan-mode:${key}:${id}`;

/** M4: the mode picked for an output, or null. */
export function storedMode(key: string, id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(modeKey(key, id));
    return v === 'annotate' ? true : v === 'interact' ? false : null;
  } catch {
    return null;
  }
}

export function rememberMode(key: string, id: string, on: boolean): void {
  try {
    window.localStorage.setItem(modeKey(key, id), on ? 'annotate' : 'interact');
  } catch {
    // the mode just isn't remembered
  }
}

/** Notes waiting on one output (chat and whole-plan notes belong to none). */
export const noteCount = (queue: readonly QueuedPrompt[], output: string): number =>
  queue.filter((q) => (q.output ?? 'main') === output && q.tag !== 'chat' && q.tag !== 'plan').length;

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  if (min < 10080) return `${Math.round(min / 1440)} d ago`;
  return new Date(t).toLocaleDateString();
}

// ---- the connection card ---------------------------------------------------

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
}

export function connectionState(
  presence: Presence,
  launch: Launch | null,
  info: ClaudeInfo | null,
  now: number,
): ConnectionState {
  if (presence.listening) return 'connected'; // also during a silent 1:50 reconnect
  if (presence.working) return 'working';
  if (launch?.mode === 'copy') return 'unsupported';
  if (launch?.mode === 'tmux') return now - launch.at >= STUCK_AFTER_MS ? 'stuck' : 'tmux';
  if (launch) return now - launch.at >= STUCK_AFTER_MS ? 'stuck' : 'starting';
  if (info?.launch === 'off') return 'off';
  if (info && (info.launch === 'copy' || info.claude_found === false)) return 'unsupported';
  return 'idle';
}

/** H6: why a launch could not open a window, in words (the reasons come from the CLI's environment). */
export const reasonsText = (reasons: readonly string[] | undefined): string =>
  reasons?.length ? ` (${reasons.slice(0, 3).join('; ')})` : '';

export function connectionText(
  state: ConnectionState,
  presence: Presence,
  launch: Launch | null,
  info: ClaudeInfo | null,
  now: number,
): string {
  const who = presence.agent === 'claude' ? 'Claude' : 'Agent';
  const sid = presence.session_id ? ` · session ${presence.session_id.slice(0, 8)}` : '';
  const elapsed = launch ? clock(now - launch.at) : '';
  const window = launch?.tmux_window || 'see-plan';
  switch (state) {
    case 'connected':
      return `${who} connected — waiting for your feedback${sid}`;
    case 'working':
      return `${who} is working on your feedback${sid}`;
    case 'starting':
      return `Starting Claude… ${elapsed}`;
    case 'tmux':
      return `Started in tmux window ${window}; attach with tmux select-window -t ${window}. ${elapsed}`;
    case 'stuck':
      return launch?.mode === 'tmux'
        ? `Claude hasn't started polling. Open the tmux window ${window}: it may be asking to trust this folder, to log in, or to allow see-plan.`
        : `Claude hasn't started polling. Check the Claude window: it may be asking to trust this folder, to log in, or to allow see-plan.${
            launch?.reasons.length
              ? ` Opened with ${launch.strategy || launch.mode}${reasonsText(launch.reasons)}.`
              : ''
          }`;
    case 'off':
      return 'Connect Claude is turned off here (MY_LAVISH_LAUNCHER=off). Connect an agent manually below.';
    case 'unsupported':
      return info?.claude_found === false && !launch?.command
        ? 'Claude Code was not found on this computer. Install it, or connect an agent manually below.'
        : `No terminal window can be opened here${reasonsText(launch?.reasons ?? info?.strategy_reasons)}. Run this in a terminal:`;
    default:
      return 'No agent connected.';
  }
}

export type ConnectionButtons = {
  connect: boolean;
  resume: boolean;
  cancel: boolean;
  retry: boolean;
  copyAllow: boolean;
  copyCommand: boolean;
  viewLog: boolean;
  showCommand: boolean;
  manual: boolean;
};

export function connectionButtons(
  state: ConnectionState,
  launch: Launch | null,
  info: ClaudeInfo | null,
  canResume: boolean,
  hasClaudeSession: boolean,
): ConnectionButtons {
  const command = launch?.command ?? '';
  const live = state === 'connected' || state === 'working';
  return {
    connect:
      state !== 'off' &&
      (state === 'idle' || (state === 'unsupported' && !command && info?.claude_found !== false)),
    resume: state === 'idle' && canResume,
    cancel: state === 'starting' || state === 'tmux',
    retry: state === 'stuck',
    copyAllow: state === 'stuck',
    copyCommand: (state === 'stuck' || state === 'unsupported') && Boolean(command),
    viewLog: live && hasClaudeSession,
    showCommand: state === 'unsupported' && Boolean(command),
    manual: !live,
  };
}

// ---- stages and the next stage ---------------------------------------------

export type NextStage = {
  from?: string | null;
  next: string | null;
  next_url?: string | null;
  next_key?: string | null;
  skipped?: boolean;
  reopened?: boolean;
};

export function nextStageView(msg: NextStage): { text: string; go: string | null } {
  if (!msg.next) return { text: 'Every stage of this feature is finished.', go: null };
  const from = (isStage(msg.from) && STAGE_TITLES[msg.from]) || 'Stage';
  const to = (isStage(msg.next) && STAGE_TITLES[msg.next]) || msg.next;
  return {
    text: msg.reopened
      ? `Verification sent work back. ${to} is open again with your issues queued.`
      : `${from}${msg.skipped ? ' skipped.' : ' approved.'} ${to} is ready.`,
    go: msg.reopened ? `Open ${to} →` : `Start ${to} →`,
  };
}

export function approveLabel(stage: Stage | null): string {
  return stage === 'verification'
    ? 'Accept'
    : `Approve ${stage ? STAGE_TITLES[stage].toLowerCase() : 'plan'}`;
}

/** The label of the agent-sent "stage" is from text, path or the workflow: the person is asked to confirm it. */
export const isInferred = (stage: Stage | null, source: string | null): boolean =>
  Boolean(stage) && (source === 'text' || source === 'path' || source === 'workflow');
