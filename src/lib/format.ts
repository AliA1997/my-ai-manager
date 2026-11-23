/** Small display helpers shared by the pages. */

const parse = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN);

export function formatDate(iso: string | undefined): string {
  const t = parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
}

/** Plans are dated by day (the name prefix), so no time of day. */
export function formatDay(iso: string | undefined): string {
  const t = parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

export function basename(path: string | undefined | null): string {
  const parts = String(path ?? '')
    .split(/[/\\]/)
    .filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export const sessionHref = (key: string): string => `/session/${encodeURIComponent(key)}`;
export const claudeHref = (id: string): string => `/claude?id=${encodeURIComponent(id)}`;

export function formatTime(iso: string | undefined): string {
  const t = parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
}
