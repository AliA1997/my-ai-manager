/** One place for talking to the local see server (DRY, FE-13). Same-origin, cookie auth. */

/** A failed request: the server's message, plus its error code and HTTP status for the pages that branch on them. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(error?.message ?? `HTTP ${res.status}`, error?.code ?? '', res.status);
  }
  return body as T;
}

/** GET a JSON endpoint. Pass the query-function signal so a stale request is cancelled. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return readJson<T>(await fetch(url, { signal }));
}

/** POST or PUT a JSON body. */
export async function sendJson<T>(url: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<T>(res);
}

/** Builds `?a=1&b=2`, skipping empty values. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : '';
}
