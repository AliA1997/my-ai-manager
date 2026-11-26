const FILTER = /^[a-z0-9-]{1,40}$/;

/**
 * Narrows the listed Claude sessions by the page's search: `q` is matched against the local vector index
 * (best match first) and `filter` is a stage slug. Without either, the list is returned unchanged.
 */
export function narrowSessions(hub, sessions, query, stageOf) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 500) : "";
  const filter = typeof query.filter === "string" && FILTER.test(query.filter) ? query.filter : "";
  if (!q && !filter) return sessions;
  const byId = new Map(sessions.map((s) => [`claude_${s.id}`, s]));
  const wanted = (s) => !filter || stageOf(s) === filter;
  if (!q) return sessions.filter(wanted);
  const hits = hub.store("sessions").search({ q, filter: filter || null, page: 1, pageSize: 100 }).items;
  return hits.map((h) => byId.get(h.id)).filter(Boolean);
}
