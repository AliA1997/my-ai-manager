import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { createAppRouter } from '../router';

export type FetchCall = { url: string; method: string; body: unknown };
type Handler = (call: FetchCall) => unknown;

/** Replaces fetch with canned JSON. Routes are matched by "METHOD path" prefix. Returns the calls and a restore(). */
export function stubFetch(routes: Record<string, Handler | unknown>) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call: FetchCall = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = Object.keys(routes).find((k) => `${call.method} ${url}`.startsWith(k));
    if (!key)
      return new Response(JSON.stringify({ error: { message: `no stub for ${call.method} ${url}` } }), {
        status: 404,
      });
    const value = routes[key];
    const body = typeof value === 'function' ? (value as Handler)(call) : value;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Loads a route the way the browser does (loader first), then renders the whole page to a string. */
export async function renderRoute(path: string): Promise<string> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
