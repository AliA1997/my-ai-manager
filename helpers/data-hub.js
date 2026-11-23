import { randomUUID } from "node:crypto";
import path from "node:path";
import { DEFAULT_CONFIG, readDataConfig, validateConfig, writeDataConfig, ensureDataConfig } from "./data-config.js";
import { DOMAINS, ensureDataDir } from "./data-dir.js";
import { DomainStore } from "./domain-store.js";

/** Domains the deletion rule applies to. Notifications are exempt so a deletion notice can never trigger another. */
export const RETAINED = Object.freeze(["errors", "sessions", "plans"]);
/** Notification kinds, also the notifications page's select filter. */
export const NOTIFICATION_KINDS = Object.freeze(["error", "deleted", "pending-download", "size"]);

/**
 * Opens `data/` (creating it only when missing) and the four domain stores, and applies the deletion rule.
 * Every deletion, and every new error, becomes a notification record.
 */
export class DataHub {
  #stores = new Map();

  constructor(dir, { now = () => new Date() } = {}) {
    this.now = now;
    const made = ensureDataDir(dir);
    this.dir = dir;
    this.created = made.created;
    ensureDataConfig(dir);
    for (const d of DOMAINS) this.#stores.set(d, new DomainStore(path.join(dir, d), { domain: d }));
  }

  store(domain) {
    const s = this.#stores.get(domain);
    if (!s) throw new Error(`unknown domain ${domain}`);
    return s;
  }

  get config() {
    return readDataConfig(this.dir);
  }

  setConfig(config) {
    const result = validateConfig(config);
    if (!result.ok) return result;
    return { ok: true, config: writeDataConfig(this.dir, result.config) };
  }

  /** Adds a notification record. */
  notify(kind, title, message, extra = {}) {
    const id = `ntf_${randomUUID()}`;
    const at = this.now().toISOString();
    this.store("notifications").put(id, { text: `${title}\n${message}`, filter: kind, createdAt: at, body: { id, kind, title, message, at, read: false, ...extra } });
    return id;
  }

  markRead(id) {
    const doc = this.store("notifications").get(id);
    if (!doc) return false;
    this.store("notifications").put(id, { text: doc.text, filter: doc.filter, createdAt: doc.createdAt, body: { ...doc.body, read: true } });
    return true;
  }

  /** Call after adding records to `domain`: applies the configured deletion rule when the threshold is reached. */
  enforce(domain) {
    if (!RETAINED.includes(domain)) return;
    const { type, threshold, deleteCount } = this.config.deletionRule ?? DEFAULT_CONFIG.deletionRule;
    const store = this.store(domain);
    const count = store.count();
    if (count < threshold) return;
    if (type === "delete-oldest") {
      const old = store.oldest(deleteCount);
      store.remove(old.map((d) => d.id));
      this.notify("deleted", `Deleted ${old.length} old ${domain} records`, `${domain} reached ${threshold} records, so the ${old.length} oldest were deleted without a download.`, { domain, deleted: old.length });
    } else if (type === "download-then-delete") {
      if (store.pendingDownload) return;
      store.setPendingDownload(true);
      this.notify("pending-download", `${domain} are waiting for download`, `${domain} reached ${threshold} records. Download them from /data to delete them.`, { domain, count });
    } else if (count === threshold || (count - threshold) % Math.max(1, Math.floor(threshold / 10)) === 0) {
      this.notify("size", `${domain} keep growing`, `${domain} holds ${count} records (threshold ${threshold}). Nothing is deleted under the current rule.`, { domain, count });
    }
  }

  /**
   * Upserts records into a domain so the vector index can search them, then applies the deletion rule.
   * `describe(record)` returns { id, text, filter }. Records already stored keep their original time.
   */
  index(domain, records, describe) {
    const store = this.store(domain);
    let added = 0;
    for (const record of records) {
      const { id, text, filter } = describe(record);
      const saved = store.get(id);
      if (!saved) added++;
      store.put(id, { text, filter, body: record, createdAt: saved?.createdAt });
    }
    if (added) this.enforce(domain);
    return added;
  }

  /** The records a download contains: { ids, json }. Deletion waits for finishDownload. */
  exportDomain(domain) {
    const docs = this.store(domain).all();
    return { ids: docs.map((d) => d.id), json: JSON.stringify({ domain, exportedAt: this.now().toISOString(), records: docs.map((d) => d.body) }, null, 2) };
  }

  /** Deletes exactly what was downloaded, clears the pending flag and notifies. */
  finishDownload(domain, ids) {
    const store = this.store(domain);
    const n = store.remove(ids);
    store.setPendingDownload(false);
    this.notify("deleted", `Deleted ${n} downloaded ${domain} records`, `The ${n} ${domain} records you downloaded were deleted.`, { domain, deleted: n });
    return n;
  }

  close() {
    for (const s of this.#stores.values()) s.close();
  }
}
