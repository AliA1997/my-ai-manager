import type { QueryClient } from '@tanstack/react-query';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { HomeSkeleton } from '../components/home/HomeSkeleton';
import { sendJson } from '../lib/api';
import {
  errorsQuery,
  homeQuery,
  OVERVIEW_PROJECTS,
  plansQuery,
  projectsQuery,
  recentNotificationsQuery,
} from '../lib/queries';
import { rootRoute } from './__root';

const SESSION_KEY = /^[0-9a-f]{16}$/;

/**
 * The route loader: loads the features and sessions before the dashboard shows (FE-11). The overview panels
 * (errors, plans, notifications) load alongside; one that fails only leaves its own panel empty.
 */
export async function loader(queryClient: QueryClient): Promise<void> {
  const overview = Promise.all([
    queryClient.prefetchQuery(errorsQuery('session', {})),
    queryClient.prefetchQuery(recentNotificationsQuery()),
    queryClient.prefetchQuery(projectsQuery()).then(async () => {
      const projects = queryClient.getQueryData(projectsQuery().queryKey)?.projects ?? [];
      await Promise.all(
        projects.slice(0, OVERVIEW_PROJECTS).map((p) => queryClient.prefetchQuery(plansQuery(p.key))),
      );
    }),
  ]);
  await Promise.all([queryClient.ensureQueryData(homeQuery()), overview]);
}

export type HomeAction =
  | { intent: 'archive'; key: string }
  | {
      intent: 'create-feature';
      name: string;
      dir: string;
      requirements: string;
      startClaude: boolean;
    };

/** The route action: archives a session, or creates a feature and returns the page to go to (FE-11). */
export async function action(input: HomeAction): Promise<{ url?: string }> {
  if (input.intent === 'archive') {
    if (!SESSION_KEY.test(input.key)) throw new Error('unexpected session key');
    await sendJson(`/api/${input.key}/archive`, 'POST', { archived: true });
    return {};
  }
  const { name, dir, requirements, startClaude } = input;
  const created = await sendJson<{ key?: unknown; url?: unknown }>('/api/workflows', 'POST', {
    name,
    dir,
    requirements,
  });
  if (typeof created.key !== 'string' || !SESSION_KEY.test(created.key) || typeof created.url !== 'string') {
    throw new Error('unexpected response');
  }
  if (startClaude) {
    await sendJson(`/api/${created.key}/connect-claude`, 'POST', {}).catch(() => undefined); // the page opens either way
  }
  return { url: created.url };
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: ({ context }) => loader(context.queryClient),
  pendingComponent: HomeSkeleton, // UX-1
  component: lazyRouteComponent(() => import('../components/home/HomePage'), 'HomePage'), // PERF-3
});
