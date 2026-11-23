import { queryOptions } from '@tanstack/react-query';
import { getJson, queryString } from './api';
import { emptyLog, mergeLog } from './logs';
import { parsePage, type ClaudeInfo, type SessionPage } from './session';
import type {
  DataConfig,
  DataPage,
  ErrorItem,
  ErrorsSummary,
  HomeData,
  LogBody,
  LogState,
  NotificationItem,
  PlanItem,
  ProjectView,
  SessionItem,
} from './types';

/** The visible tab refreshes every 30 s. React Query pauses this while the page is hidden. */
const REFRESH_MS = 30_000;

export const ERRORS_PAGE_SIZE = 25;
export const NOTIFICATIONS_PAGE_SIZE = 25;

export type ListSearch = { q?: string | undefined; filter?: string | undefined; page?: number | undefined };

export const projectsQuery = () =>
  queryOptions({
    queryKey: ['projects'],
    queryFn: ({ signal }) =>
      getJson<{ projects: ProjectView[] }>(`/api/projects${queryString({ limit: 50 })}`, signal),
  });

export const summaryQuery = (project: string) =>
  queryOptions({
    queryKey: ['errors', 'summary', project],
    queryFn: ({ signal }) => getJson<ErrorsSummary>(`/api/errors/summary${queryString({ project })}`, signal),
    refetchInterval: REFRESH_MS,
  });

export const errorsQuery = (context: 'session' | 'plan', search: ListSearch) =>
  queryOptions({
    queryKey: ['errors', 'list', context, search.q ?? '', search.filter ?? '', search.page ?? 1],
    queryFn: ({ signal }) =>
      getJson<DataPage<ErrorItem>>(
        `/api/errors${queryString({
          context,
          pageSize: ERRORS_PAGE_SIZE,
          page: search.page ?? 1,
          severity: search.filter,
          q: search.q,
        })}`,
        signal,
      ),
    refetchInterval: REFRESH_MS,
  });

export const plansQuery = (project: string) =>
  queryOptions({
    queryKey: ['plans', project],
    queryFn: ({ signal }) =>
      getJson<{ items: PlanItem[]; total?: number }>(
        `/api/projects/${encodeURIComponent(project)}/plans`,
        signal,
      ),
    refetchInterval: REFRESH_MS,
  });

export const sessionsQuery = (search: Pick<ListSearch, 'q' | 'filter'> = {}) =>
  queryOptions({
    queryKey: ['claude-sessions', search.q ?? '', search.filter ?? ''],
    queryFn: ({ signal }) =>
      getJson<{ sessions: SessionItem[] }>(
        `/api/claude-sessions${queryString({ limit: 75, q: search.q, filter: search.filter })}`,
        signal,
      ),
    refetchInterval: REFRESH_MS,
  });

export const notificationsQuery = (search: ListSearch) =>
  queryOptions({
    queryKey: ['notifications', search.q ?? '', search.filter ?? '', search.page ?? 1],
    queryFn: ({ signal }) =>
      getJson<DataPage<NotificationItem>>(
        `/api/data/notifications${queryString({
          page: search.page ?? 1,
          pageSize: NOTIFICATIONS_PAGE_SIZE,
          q: search.q,
          filter: search.filter,
        })}`,
        signal,
      ),
  });

export const homeQuery = () =>
  queryOptions({
    queryKey: ['home'],
    queryFn: async ({ signal }): Promise<HomeData> => {
      const body = await getJson<Partial<HomeData>>('/api/sessions', signal);
      return { sessions: body.sessions ?? [], workflows: body.workflows ?? [] };
    },
    refetchInterval: REFRESH_MS, // the live socket is the fast path; this is the fallback
  });

export const dataConfigQuery = () =>
  queryOptions({
    queryKey: ['data-config'],
    queryFn: ({ signal }) => getJson<DataConfig>('/api/data/config', signal),
  });

const LOG_POLL_MS = 2000;

/** True when the reader is within 120 px of the bottom. Measured before the next entries render. */
function nearBottom(): boolean {
  if (typeof document === 'undefined') return true;
  const doc = document.documentElement;
  return doc.scrollHeight - (window.scrollY + window.innerHeight) < 120;
}

export const logKey = (id: string) => ['claude-log', id] as const;

/**
 * One Claude session's transcript. Each poll asks only for what came after the last read and folds it into the
 * cached state, so the list grows without any effect or local state (FE-10).
 */
export const logQuery = (id: string) =>
  queryOptions({
    queryKey: logKey(id),
    queryFn: async ({ client, signal }): Promise<LogState> => {
      const prev = client.getQueryData<LogState>(logKey(id));
      const after = prev?.next ?? null;
      const body = await getJson<LogBody>(
        `/api/claude-sessions/${encodeURIComponent(id)}/log${queryString({ after })}`,
        signal,
      );
      return mergeLog(prev ?? emptyLog(id), body, nearBottom());
    },
    refetchInterval: LOG_POLL_MS,
    staleTime: 0,
    gcTime: 60_000,
  });

/** The review page's session: its chat, stage, workflow and outputs. Live changes arrive on the socket (lib/session-live.ts). */
export const sessionPageQuery = (key: string) =>
  queryOptions({
    queryKey: ['session-page', key],
    queryFn: async ({ signal }): Promise<SessionPage> =>
      parsePage(await getJson<unknown>(`/api/${encodeURIComponent(key)}/page`, signal)),
    staleTime: Infinity, // the socket keeps it current; a reload reads it again
  });

/** How Connect Claude can launch on this computer. The page works without it. */
export const claudeStatusQuery = (key: string) =>
  queryOptions({
    queryKey: ['claude-status', key],
    queryFn: async ({ signal }): Promise<ClaudeInfo | null> => {
      const body = await getJson<Partial<ClaudeInfo>>(`/api/claude-status${queryString({ key })}`, signal);
      return typeof body.launch === 'string' ? (body as ClaudeInfo) : null;
    },
    staleTime: 60_000,
    retry: false,
  });

/** True when the log panel is scrolled to within 120 px of its end. Measured before the next entries render. */
function panelNearBottom(): boolean {
  const el = typeof document === 'undefined' ? null : document.getElementById('claude-log-panel');
  return el ? el.scrollHeight - (el.scrollTop + el.clientHeight) < 120 : true;
}

export const sessionLogKey = (key: string, claudeId: string) => ['session-log', key, claudeId] as const;

/** The transcript of the Claude session attached to this review, polled like the /claude page does. */
export const sessionLogQuery = (key: string, claudeId: string) =>
  queryOptions({
    queryKey: sessionLogKey(key, claudeId),
    queryFn: async ({ client, signal }): Promise<LogState> => {
      const prev = client.getQueryData<LogState>(sessionLogKey(key, claudeId));
      const after = prev?.next ?? null;
      const body = await getJson<LogBody>(
        `/api/${encodeURIComponent(key)}/claude-log${queryString({ after })}`,
        signal,
      );
      return mergeLog(prev ?? emptyLog(claudeId), body, panelNearBottom());
    },
    refetchInterval: LOG_POLL_MS, // paused while the page is hidden
    staleTime: 0,
    gcTime: 60_000,
  });

export const RECENT_NOTIFICATIONS = 10;
export const OVERVIEW_ERRORS = 5;
export const OVERVIEW_PROJECTS = 3;

/** The dashboard's "recent notifications": the newest ten. */
export const recentNotificationsQuery = () =>
  queryOptions({
    queryKey: ['notifications', 'recent'],
    queryFn: ({ signal }) =>
      getJson<DataPage<NotificationItem>>(
        `/api/data/notifications${queryString({ page: 1, pageSize: RECENT_NOTIFICATIONS })}`,
        signal,
      ),
    refetchInterval: REFRESH_MS,
  });

/** The CLI's commands, as the CLI itself describes them. */
export const helpQuery = () =>
  queryOptions({
    queryKey: ['help'],
    queryFn: ({ signal }) => getJson<{ version: string; usage: string }>('/api/help', signal),
    staleTime: Infinity,
  });
