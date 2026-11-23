export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Clamps `value` to a whole number in [min, max]; `fallback` when it is not a number. */
export function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Page numbers (1-based) and size from query values, safe against junk input. */
export function pageParams(query = {}) {
  return {
    page: clampInt(query.page, 1, 1, 1_000_000),
    pageSize: clampInt(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
  };
}

/** The slice of `items` for one page, plus the paging facts the UI needs. */
export function paginate(items, { page, pageSize }) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), total, page: current, pageSize, pages };
}
