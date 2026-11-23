import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { NotificationsSkeleton } from '../components/notifications/NotificationsSkeleton';
import { sendJson } from '../lib/api';
import { dataConfigQuery, notificationsQuery, type ListSearch } from '../lib/queries';
import type { DeletionRule } from '../lib/types';
import { rootRoute } from './__root';

export type NotificationsSearch = { q?: string; filter?: string; page?: number };

const KIND = /^[a-z0-9_-]{1,40}$/;

/** Search params come from the URL, so they are checked before use (SEC-12). */
export function validateNotificationsSearch(raw: Record<string, unknown>): NotificationsSearch {
  const out: NotificationsSearch = {};
  if (typeof raw.q === 'string' && raw.q.trim() !== '') out.q = raw.q.trim().slice(0, 500);
  if (typeof raw.filter === 'string' && KIND.test(raw.filter)) out.filter = raw.filter;
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** The route loader: loads the list page and the data settings before the page shows (FE-11). */
export async function loader(queryClient: QueryClient, search: ListSearch): Promise<void> {
  await Promise.all([
    queryClient.ensureQueryData(notificationsQuery(search)),
    queryClient.ensureQueryData(dataConfigQuery()),
  ]);
}

export type NotificationsAction =
  { intent: 'mark-read'; id: string } | { intent: 'save-settings'; rule: DeletionRule };

/** The route action: changes notifications or the deletion-rule settings (FE-11). */
export async function action(input: NotificationsAction): Promise<void> {
  if (input.intent === 'mark-read') {
    await sendJson('/api/notifications/read', 'POST', { id: input.id });
    return;
  }
  await sendJson('/api/data/config', 'PUT', { deletionRule: input.rule });
}

export const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  validateSearch: validateNotificationsSearch,
  loaderDeps: ({ search }) => ({ q: search.q, filter: search.filter, page: search.page }),
  loader: ({ context, deps }) => loader(context.queryClient, deps),
  pendingComponent: NotificationsSkeleton, // UX-1
  component: lazyRouteComponent(
    () => import('../components/notifications/NotificationsPage'),
    'NotificationsPage',
  ), // PERF-3
});
