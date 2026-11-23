import { DOMAINS } from "../helpers/data-dir.js";
import { NOTIFICATION_KINDS } from "../helpers/data-hub.js";
import { pageParams } from "../helpers/pagination.js";
import { SEVERITIES } from "./severity.js";

const MAX_QUERY = 500;
const FILTER_RE = /^[a-z0-9_-]{1,40}$/;
const PREVIEW_CHARS = 500;

/** The values each page's select filter offers (the errors page filters by severity). */
export const FILTER_OPTIONS = Object.freeze({
  errors: [...SEVERITIES, "unrated"],
  notifications: NOTIFICATION_KINDS,
  sessions: [],
  plans: [],
});

const errorBody = (code, message) => ({ error: { code, message } });

/** A stored document as the API shows it: the record body, a text preview and the search score. */
function present(doc) {
  const text = String(doc.body.text ?? doc.text ?? "");
  return { ...doc.body, id: doc.id, text: text.slice(0, PREVIEW_CHARS), truncated: text.length > PREVIEW_CHARS, ...(doc.score === undefined ? {} : { score: doc.score }) };
}

/**
 * Mounts the data routes: search + filter + pagination over each domain's local vector index,
 * notifications, the deletion-rule config and the download that deletion waits for.
 * @param {import("express").Express} app
 * @param {{ hub: import("../helpers/data-hub.js").DataHub, refusedCrossSite: Function, requireSameOrigin: Function }} deps
 */
export function registerDataRoutes(app, { hub, refusedCrossSite, requireSameOrigin }) {
  app.get("/api/data/config", (req, res) => {
    if (refusedCrossSite(req, res)) return;
    res.json({ config: hub.config, dir: hub.dir });
  });

  app.put("/api/data/config", (req, res) => {
    if (!requireSameOrigin(req)) return res.status(403).json(errorBody("FORBIDDEN_ORIGIN", "Settings must come from a see-plan page"));
    const result = hub.setConfig(req.body);
    if (!result.ok) return res.status(400).json(errorBody("VALIDATION_ERROR", result.error));
    res.json({ config: result.config });
  });

  app.get("/api/data/:domain", (req, res) => {
    if (refusedCrossSite(req, res)) return;
    const { domain } = req.params;
    if (!DOMAINS.includes(domain)) return res.status(404).json(errorBody("NOT_FOUND", "Unknown data domain"));
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length > MAX_QUERY) return res.status(400).json(errorBody("VALIDATION_ERROR", `q must be at most ${MAX_QUERY} characters`));
    const filter = typeof req.query.filter === "string" && req.query.filter !== "" ? req.query.filter : null;
    if (filter !== null && !FILTER_RE.test(filter)) return res.status(400).json(errorBody("VALIDATION_ERROR", "filter has characters that are not allowed"));
    const store = hub.store(domain);
    const found = store.search({ q, filter, ...pageParams(req.query) });
    res.json({ ...found, items: found.items.map(present), options: FILTER_OPTIONS[domain], counts: store.countsByFilter(), pendingDownload: store.pendingDownload });
  });

  app.post("/api/notifications/read", (req, res) => {
    if (!requireSameOrigin(req)) return res.status(403).json(errorBody("FORBIDDEN_ORIGIN", "Must come from a see-plan page"));
    const id = req.body?.id;
    if (typeof id !== "string" || !hub.markRead(id)) return res.status(404).json(errorBody("NOT_FOUND", "No such notification"));
    res.json({ ok: true });
  });

  // Downloading is what allows the "download then delete" rule to delete: it deletes exactly what was sent.
  app.get("/api/data/:domain/export", (req, res) => {
    if (refusedCrossSite(req, res)) return;
    const { domain } = req.params;
    if (!DOMAINS.includes(domain) || domain === "notifications") return res.status(404).json(errorBody("NOT_FOUND", "Unknown data domain"));
    const { ids, json } = hub.exportDomain(domain);
    res.set("Content-Disposition", `attachment; filename="see-plan-${domain}.json"`);
    res.type("application/json");
    res.once("finish", () => {
      if (hub.store(domain).pendingDownload) hub.finishDownload(domain, ids);
    });
    res.send(json);
  });
}
