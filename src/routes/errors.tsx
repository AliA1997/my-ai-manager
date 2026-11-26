import type { QueryClient } from '@tanstack/react-query';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { ErrorsSkeleton } from '../components/errors/ErrorsSkeleton';
import { sendJson } from '../lib/api';
import { findProject, isTabId, PROJECT_KEY, resolveTab, TAB_CONTEXT, type TabId } from '../lib/errors-tabs';
import { isSessionFilter } from '../lib/logs';
import { isFilter } from '../lib/severity';
import {
  errorsQuery,
  plansQuery,
  projectsQuery,
  sessionsQuery,
  summaryQuery,
  type ListSearch,
} from '../lib/queries';
import { rootRoute } from './__root';

export type ErrorsSearch = { tab?: TabId; project?: string; q?: string; filter?: string; page?: number };

/** Search params come from the URL, so they are checked before use (SEC-12). */
export function validateErrorsSearch(raw: Record<string, unknown>): ErrorsSearch {
  const out: ErrorsSearch = {};
  if (isTabId(raw.tab)) out.tab = raw.tab;
  if (typeof raw.project === 'string' && PROJECT_KEY.test(raw.project)) out.project = raw.project;
  if (typeof raw.q === 'string' && raw.q.trim() !== '') out.q = raw.q.trim().slice(0, 500);
  if (isFilter(raw.filter) || isSessionFilter(raw.filter)) out.filter = raw.filter;
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** The route loader: loads the project list, the counts and the active tab before the page shows (FE-11). */
export async function loader(queryClient: QueryClient, search: ErrorsSearch): Promise<void> {
  const { projects } = await queryClient.ensureQueryData(projectsQuery());
  const project = findProject(projects, search.project);
  const tab = resolveTab(search.tab, project);
  const list: ListSearch = { q: search.q, filter: search.filter, page: search.page };
  const context = TAB_CONTEXT[tab];
  await Promise.all([
    project ? queryClient.ensureQueryData(summaryQuery(project.key)) : undefined,
    context ? queryClient.ensureQueryData(errorsQuery(context, list)) : undefined,
    tab === 'plans' && project ? queryClient.ensureQueryData(plansQuery(project.key)) : undefined,
    tab === 'sessions'
      ? queryClient.ensureQueryData(sessionsQuery({ q: search.q, filter: search.filter }))
      : undefined,
  ]);
}

export type ErrorsAction =
  | {
      intent: 'rate';
      claude_session_id: string;
      uuid: string;
      part: number;
      severity: string;
      reason: string | null;
    }
  | { intent: 'open-plan'; project: string; name: string };

const REVIEW_KEY = /^[0-9a-f]{16}$/;

/** The route action: rates an error once, or opens a plan as a review session. Returns the key to go to. */
export async function action(input: ErrorsAction): Promise<{ key?: string }> {
  if (input.intent === 'rate') {
    const { claude_session_id, uuid, part, severity, reason } = input;
    await sendJson('/api/errors/rate', 'POST', { claude_session_id, uuid, part, severity, reason });
    return {};
  }
  const result = await sendJson<{ key?: unknown }>(
    `/api/projects/${encodeURIComponent(input.project)}/plans/open`,
    'POST',
    { name: input.name },
  );
  if (typeof result.key !== 'string' || !REVIEW_KEY.test(result.key)) throw new Error('unexpected response');
  return { key: result.key };
}

export const errorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/errors',
  validateSearch: validateErrorsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loader(context.queryClient, deps),
  pendingComponent: ErrorsSkeleton, // UX-1
  component: lazyRouteComponent(() => import('../components/errors/ErrorsPage'), 'ErrorsPage'), // PERF-3
});
