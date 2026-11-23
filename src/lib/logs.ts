import { isSeverity, SEVERITY_TITLES } from './severity';
import type { LogBody, LogEntry, LogState, SessionItem, Severity } from './types';

/** Pure helpers for the Claude log page: merging polled entries, entry references and the chosen session. */

export const MAX_ENTRIES = 1000;
export const PREVIEW_CHARS = 300;
export const MAX_REASON = 2000;

const CLAUDE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isClaudeId = (value: unknown): value is string =>
  typeof value === 'string' && CLAUDE_ID.test(value);

/** "<uuid>:<part>", or '' when the entry cannot be logged. */
export function refOf(entry: LogEntry): string {
  return typeof entry.uuid === 'string' ? `${entry.uuid}:${Number(entry.part) || 0}` : '';
}

export function roleLabel(entry: LogEntry): string {
  const kind =
    entry.kind === 'tool_use' ? ' · tool call' : entry.kind === 'tool_result' ? ' · tool result' : '';
  return `${entry.role === 'assistant' ? 'Claude' : 'User'}${kind}`;
}

export function clip(text: string | undefined, n: number): string {
  const s = String(text ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function projectLabel(s: Pick<SessionItem, 'cwd' | 'project'>): string {
  const parts = String(s.cwd ?? '')
    .split(/[/\\]/)
    .filter(Boolean);
  return parts[parts.length - 1] ?? String(s.project ?? '');
}

/** Which session to show: the asked one if it has a valid id (even when it is not in the list), else the newest. */
export function resolveSessionId(
  wanted: string | undefined,
  sessions: readonly SessionItem[],
): string | null {
  if (wanted && isClaudeId(wanted.toLowerCase())) return wanted.toLowerCase();
  return sessions[0]?.id ?? null;
}

export function emptyLog(id: string): LogState {
  return {
    id,
    found: false,
    entries: [],
    next: null,
    counter: 0,
    omitted: false,
    lastPromptAt: null,
    reported: {},
    severities: {},
    reasons: {},
    stick: true,
  };
}

const onlySeverities = (raw: unknown): Record<string, Severity> => {
  const out: Record<string, Severity> = {};
  if (raw && typeof raw === 'object') {
    for (const [ref, value] of Object.entries(raw)) if (isSeverity(value)) out[ref] = value;
  }
  return out;
};

const onlyStrings = (raw: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [ref, value] of Object.entries(raw)) if (typeof value === 'string') out[ref] = value;
  }
  return out;
};

/**
 * Folds one poll answer into what the page already has. `stick` says the reader was at the bottom, so the page
 * follows new entries. A replaced transcript (`omitted` after the first read) starts over.
 */
export function mergeLog(prev: LogState | undefined, body: LogBody, stick: boolean): LogState {
  const base = prev ?? emptyLog(body.claude_session_id ?? '');
  if (!body.found) return { ...base, found: false, stick };
  const first = base.next === null;
  const restart = Boolean(body.omitted) && !first;
  const fresh = (body.entries ?? []).filter((e): e is LogEntry => Boolean(e) && typeof e === 'object');
  const kept = restart ? [] : base.entries;
  const start = restart ? 0 : base.counter;
  const added = fresh.map((entry, i) => ({ ...entry, seq: start + i }));
  return {
    ...base,
    found: true,
    entries: [...kept, ...added].slice(-MAX_ENTRIES),
    counter: start + added.length,
    next: typeof body.next === 'number' ? body.next : base.next,
    omitted: first ? Boolean(body.omitted) : base.omitted,
    lastPromptAt: body.last_prompt_at ?? base.lastPromptAt,
    reported: {
      ...base.reported,
      ...Object.fromEntries((Array.isArray(body.reported) ? body.reported : []).map((r) => [r, true])),
    },
    severities: { ...base.severities, ...onlySeverities(body.severities) },
    reasons: { ...base.reasons, ...onlyStrings(body.reasons) },
    stick: first || stick,
  };
}

/** Marks one entry as logged once the server has saved it (the first reason and severity win on a duplicate). */
export function withLogged(
  prev: LogState,
  ref: string,
  saved: { severity: Severity; reason: string | null },
): LogState {
  return {
    ...prev,
    reported: { ...prev.reported, [ref]: true },
    severities: { ...prev.severities, [ref]: saved.severity },
    reasons: saved.reason ? { ...prev.reasons, [ref]: saved.reason } : prev.reasons,
    stick: false,
  };
}

export function statusMessage(state: LogState): string {
  if (!state.found) return 'No transcript found for this session.';
  if (state.omitted) return 'Showing the most recent entries; earlier ones are omitted.';
  return state.entries.length ? '' : 'This session has no entries yet.';
}

/** The line shown after an entry is logged. */
export function loggedMessage(
  saved: { severity: Severity; reason: string | null; duplicate: boolean },
  errorLog: string,
): string {
  if (saved.duplicate) return `Already in ${errorLog}; the first reason and severity were kept.`;
  return `Added to ${errorLog} as ${SEVERITY_TITLES[saved.severity]}${saved.reason ? ', with your reason.' : '.'}`;
}
