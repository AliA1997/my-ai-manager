import type { QueryClient } from '@tanstack/react-query';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { HelpSkeleton } from '../components/help/HelpSkeleton';
import { helpQuery } from '../lib/queries';
import { rootRoute } from './__root';

/** The route loader: loads the CLI help the server holds (FE-11). The page only reads, so it has no action. */
export async function loader(queryClient: QueryClient): Promise<void> {
  await queryClient.ensureQueryData(helpQuery());
}

export const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/help',
  loader: ({ context }) => loader(context.queryClient),
  pendingComponent: HelpSkeleton, // UX-1
  component: lazyRouteComponent(() => import('../components/help/HelpPage'), 'HelpPage'), // PERF-3
});
