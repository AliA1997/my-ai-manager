import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DIMENSIONS, VectorCache } from "../src/vector-cache.js";
import { paginate } from "./pagination.js";

export const DOCSTORE_FILE = "docstore.sqlite";
export const INDEX_FILE = "index.vec";
export const MANIFEST_FILE = "manifest.json";
const FLUSH_MS = 250;

/**
 * One domain's local storage: `docstore.sqlite` (the records), `index.vec` (the vector index, rebuilt from
 * the records whenever it is missing or out of step) and `manifest.json` (counts and the pending-download flag).
 * `filter` is the one value the domain's page filters by (severity for errors, kind for notifications, ...).
 */
export class DomainStore {
  #db;
  #dir;
  #vectors = new VectorCache();
  #timer = null;
  #manifest;

  /** @param {string} dir the domain folder, for example `data/errors` */
  constructor(dir, { domain = path.basename(dir) } = {}) {
    this.domain = domain;
    this.#dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.#db = new DatabaseSync(path.join(dir, DOCSTORE_FILE));
    this.#db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        text TEXT NOT NULL,
        filter TEXT,
        body TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS docs_filter ON docs (filter, seq);`);
    this.#manifest = this.#readManifest();
    this.#loadIndex();
  }

  get dir() {
    return this.#dir;
  }

  get pendingDownload() {
    return this.#manifest.pendingDownload === true;
  }

  count() {
    return this.#db.prepare("SELECT COUNT(*) AS n FROM docs").get().n;
  }

  /** Bytes the domain uses on disk. */
  bytes() {
    let total = 0;
    for (const f of fs.readdirSync(this.#dir)) total += fs.statSync(path.join(this.#dir, f)).size;
    return total;
  }

  /** Adds or replaces a record. `body` is any JSON-safe object; `text` is what the vector index searches. */
  put(id, { text = "", filter = null, body = {}, createdAt = new Date().toISOString() } = {}) {
    this.#db.prepare(`INSERT INTO docs (id, created_at, text, filter, body) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET text = excluded.text, filter = excluded.filter, body = excluded.body`)
      .run(id, createdAt, text, filter, JSON.stringify(body));
    this.#vectors.set(id, text, { filter });
    this.#touch();
  }

  /** The record with `id`, or null. */
  get(id) {
    const row = this.#db.prepare("SELECT * FROM docs WHERE id = ?").get(id);
    return row ? toDoc(row) : null;
  }

  has(id) {
    return this.#db.prepare("SELECT 1 AS x FROM docs WHERE id = ?").get(id) !== undefined;
  }

  /** Removes records by id; returns how many were removed. */
  remove(ids) {
    const del = this.#db.prepare("DELETE FROM docs WHERE id = ?");
    let n = 0;
    for (const id of ids) {
      n += Number(del.run(id).changes);
      this.#vectors.delete(id);
    }
    if (n) this.#touch();
    return n;
  }

  /** The oldest `n` records, oldest first. */
  oldest(n) {
    return this.#db.prepare("SELECT * FROM docs ORDER BY seq ASC LIMIT ?").all(n).map(toDoc);
  }

  /** Every record, oldest first (for the download). */
  all() {
    return this.#db.prepare("SELECT * FROM docs ORDER BY seq ASC").all().map(toDoc);
  }

  /** Counts per filter value, for badges and tabs. */
  countsByFilter() {
    const out = {};
    for (const r of this.#db.prepare("SELECT filter, COUNT(*) AS n FROM docs GROUP BY filter").all()) out[r.filter ?? "none"] = r.n;
    return out;
  }

  /**
   * One page of records, newest first. With `q`, the records most like `q` come first (vector search);
   * `filter` narrows to one filter value. Returns { items, total, page, pageSize, pages }.
   */
  search({ q = "", filter = null, page = 1, pageSize = 25 } = {}) {
    const query = String(q).trim();
    if (query) {
      const hits = this.#vectors.search(query, { topK: Math.max(1, this.#vectors.size), filter: filter ? (m) => m.filter === filter : null });
      const found = paginate(hits, { page, pageSize });
      const get = this.#db.prepare("SELECT * FROM docs WHERE id = ?");
      return { ...found, items: found.items.map((h) => ({ ...toDoc(get.get(h.id)), score: h.score })) };
    }
    const total = this.#db.prepare("SELECT COUNT(*) AS n FROM docs WHERE (?1 IS NULL OR filter = ?1)").get(filter).n;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(page, pages);
    const rows = this.#db.prepare("SELECT * FROM docs WHERE (?1 IS NULL OR filter = ?1) ORDER BY seq DESC LIMIT ?2 OFFSET ?3")
      .all(filter, pageSize, (current - 1) * pageSize);
    return { items: rows.map(toDoc), total, page: current, pageSize, pages };
  }

  /** Flags that a download is waiting; deletion happens only after it is taken. */
  setPendingDownload(on) {
    this.#manifest.pendingDownload = on;
    this.#writeManifest();
  }

  /** Writes the vector index and manifest now. */
  flush() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const ids = this.#vectors.ids;
    const header = Buffer.from(JSON.stringify({ dimensions: DIMENSIONS, ids }) + "\n");
    const matrix = Buffer.from(this.#vectors.matrix.buffer, 0, ids.length * DIMENSIONS * 4);
    const file = path.join(this.#dir, INDEX_FILE);
    fs.writeFileSync(`${file}.tmp`, Buffer.concat([header, matrix]));
    fs.renameSync(`${file}.tmp`, file);
    this.#writeManifest();
  }

  close() {
    this.flush();
    this.#db.close();
  }

  #touch() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => this.flush(), FLUSH_MS);
    this.#timer.unref();
  }

  #readManifest() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.#dir, MANIFEST_FILE), "utf8"));
    } catch {
      return { version: 1 };
    }
  }

  #writeManifest() {
    this.#manifest = { ...this.#manifest, version: 1, domain: this.domain, dimensions: DIMENSIONS, count: this.count(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(this.#dir, MANIFEST_FILE), JSON.stringify(this.#manifest, null, 2) + "\n");
  }

  /** Loads index.vec when it matches the records exactly; otherwise rebuilds it from the records. */
  #loadIndex() {
    const rows = this.#db.prepare("SELECT id, text, filter FROM docs ORDER BY seq").all();
    try {
      const buf = fs.readFileSync(path.join(this.#dir, INDEX_FILE));
      const nl = buf.indexOf(10);
      const head = JSON.parse(buf.subarray(0, nl).toString("utf8"));
      const floats = new Float32Array(buf.buffer.slice(buf.byteOffset + nl + 1, buf.byteOffset + buf.length));
      const known = new Set(rows.map((r) => r.id));
      const same = head.dimensions === DIMENSIONS && head.ids.length === rows.length && floats.length === rows.length * DIMENSIONS
        && head.ids.every((id) => known.has(id));
      if (same) {
        const filters = new Map(rows.map((r) => [r.id, r.filter]));
        head.ids.forEach((id, i) => this.#vectors.setRaw(id, floats.subarray(i * DIMENSIONS, (i + 1) * DIMENSIONS), { filter: filters.get(id) }));
        return;
      }
    } catch {}
    for (const r of rows) this.#vectors.set(r.id, r.text, { filter: r.filter });
    if (rows.length) this.flush();
  }
}

function toDoc(row) {
  return { id: row.id, createdAt: row.created_at, text: row.text, filter: row.filter, body: JSON.parse(row.body) };
}
