import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

export type RouterContext = { queryClient: QueryClient };

/** The root route: every page renders inside <main> so the layout has one landmark (A11Y-1). */
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <main className="px-6 py-8">
      <h1 className="text-xl font-semibold text-fg">Page not found</h1>
      <p className="text-muted">
        <a href="/" className="text-link underline">
          Back to the dashboard
        </a>
      </p>
    </main>
  ),
});
