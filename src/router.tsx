import { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { errorsRoute } from './routes/errors';
import { helpRoute } from './routes/help';
import { homeRoute } from './routes/home';
import { logsRoute } from './routes/logs';
import { notificationsRoute } from './routes/notifications';
import { sessionRoute } from './routes/session';

const routeTree = rootRoute.addChildren([
  homeRoute,
  logsRoute,
  errorsRoute,
  notificationsRoute,
  sessionRoute,
  helpRoute,
]);

/** Builds the router and the query cache it shares with every loader. */
export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history ? { history } : {}),
    context: { queryClient },
    defaultPreload: 'intent', // UX-6: prefetch the next route on hover or focus
    defaultPendingMs: 100,
    defaultPendingMinMs: 300,
    defaultPreloadStaleTime: 0,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
