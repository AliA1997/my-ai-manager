import type { QueryClient } from '@tanstack/react-query';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { LogsSkeleton } from '../components/logs/LogsSkeleton';
import { sendJson } from '../lib/api';
import { PROJECT_KEY } from '../lib/errors-tabs';
import { isClaudeId, isSessionFilter, MAX_REASON, resolveSessionId } from '../lib/logs';
import { logQuery, sessionsQuery } from '../lib/queries';
import { isSeverity, REASON_REQUIRED } from '../lib/severity';
import type { LogEntry, Severity } from '../lib/types';
import { rootRoute } from './__root';

export type LogsSearch = { id?: string; project?: string; q?: string; filter?: string };

/** Search params come from the URL, so they are checked before use (SEC-12). */
export function validateLogsSearch(raw: Record<string, unknown>): LogsSearch {
  const out: LogsSearch = {};
  if (typeof raw.id === 'string' && isClaudeId(raw.id.toLowerCase())) out.id = raw.id.toLowerCase();
  if (typeof raw.project === 'string' && PROJECT_KEY.test(raw.project)) out.project = raw.project;
  if (typeof raw.q === 'string' && raw.q.trim() !== '') out.q = raw.q.trim().slice(0, 500);
  if (isSessionFilter(raw.filter)) out.filter = raw.filter;
  return out;
}

/** The route loader: loads the recent sessions, then the transcript of the chosen one (FE-11). */
export async function loader(queryClient: QueryClient, search: LogsSearch): Promise<void> {
  const { sessions } = await queryClient.ensureQueryData(
    sessionsQuery({ q: search.q, filter: search.filter }),
  );
  const id = resolveSessionId(search.id, sessions);
  if (id) await queryClient.ensureQueryData(logQuery(id));
}

export type LogsAction = {
  intent: 'log-entry';
  sessionId: string;
  entry: LogEntry;
  severity: Severity;
  reason: string | null;
};

export type LoggedEntry = { severity: Severity; reason: string | null; duplicate: boolean };

/** The route action: logs one transcript entry as an error. The server keeps the first severity and reason. */
export async function action(input: LogsAction): Promise<LoggedEntry> {
  const { sessionId, entry, severity, reason } = input;
  if (!isClaudeId(sessionId)) throw new Error('unexpected session id');
  if (!isSeverity(severity)) throw new Error('unexpected severity');
  const why = reason?.trim().slice(0, MAX_REASON) || null;
  if (REASON_REQUIRED.includes(severity) && !why) throw new Error('High and Send to IT need a reason');
  const saved = await sendJson<{ severity?: unknown; reason?: unknown; duplicate?: unknown }>(
    '/api/claude-errors',
    'POST',
    {
      entry: {
        claude_session_id: sessionId,
        uuid: entry.uuid,
        part: Number(entry.part) || 0,
        role: String(entry.role ?? ''),
        kind: String(entry.kind ?? ''),
        at: entry.at ? String(entry.at) : null,
        text: String(entry.text ?? ''),
        reason: why,
        severity,
      },
    },
  );
  return {
    severity: isSeverity(saved.severity) ? saved.severity : severity,
    reason: typeof saved.reason === 'string' && saved.reason ? saved.reason : why,
    duplicate: saved.duplicate === true,
  };
}

export const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/claude',
  validateSearch: validateLogsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loader(context.queryClient, deps),
  pendingComponent: LogsSkeleton, // UX-1
  component: lazyRouteComponent(() => import('../components/logs/LogsPage'), 'LogsPage'), // PERF-3
});
