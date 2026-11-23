import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DataHub } from "../helpers/data-hub.js";
import { ensureDataDir } from "../helpers/data-dir.js";

const open = [];

/** A fresh data dir. Open stores are closed before the folder is removed (Windows will not delete open files). */
async function tmp(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-data-"));
  t.after(async () => {
    for (const h of open.splice(0)) h.close();
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return path.join(dir, "data");
}

/** A DataHub that the cleanup above closes. */
function hubAt(dir) {
  const hub = new DataHub(dir);
  open.push({ close: () => { try { hub.close(); } catch {} } });
  return hub;
}

test("data/ is created only when missing, with one folder per domain and a default config", async (t) => {
  const dir = await tmp(t);
  assert.equal(ensureDataDir(dir).created, true);
  fs.writeFileSync(path.join(dir, "errors", "keep.txt"), "x");
  assert.equal(ensureDataDir(dir).created, false);
  assert.ok(fs.existsSync(path.join(dir, "errors", "keep.txt")));
  const hub = hubAt(dir);
  for (const d of ["errors", "notifications", "sessions", "plans"]) {
    assert.ok(fs.existsSync(path.join(dir, d, "docstore.sqlite")), d);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).deletionRule.type, "notify-only");
  assert.equal(fs.existsSync(path.join(dir, "config", "index.vec")), false, "configuration has no vector index");
});

test("search ranks by the vector index, filters by select value and paginates", async (t) => {
  const hub = hubAt(await tmp(t));
  const s = hub.store("errors");
  for (let i = 0; i < 7; i++) s.put(`e${i}`, { text: `database migration failed ${i}`, filter: i % 2 ? "high" : "low", body: { i } });
  s.put("x", { text: "css colour contrast", filter: "low", body: {} });
  const page = s.search({ q: "migration", pageSize: 3, page: 3 });
  assert.equal(page.total, 7);
  assert.equal(page.pages, 3);
  assert.equal(page.items.length, 1);
  assert.equal(s.search({ filter: "high" }).total, 3);
  assert.equal(s.search({ q: "contrast" }).items[0].id, "x");
  assert.equal(s.search({ pageSize: 2 }).items[0].id, "x", "newest first without a query");
});

test("the vector index survives a restart and is rebuilt when missing", async (t) => {
  const dir = await tmp(t);
  let hub = hubAt(dir);
  hub.store("errors").put("a", { text: "timeout talking to the database", body: {} });
  hub.close();
  hub = hubAt(dir);
  assert.equal(hub.store("errors").search({ q: "database timeout" }).items[0].id, "a");
  hub.close();
  fs.rmSync(path.join(dir, "errors", "index.vec"));
  hub = hubAt(dir);
  assert.equal(hub.store("errors").search({ q: "database timeout" }).items[0].id, "a");
});

test("delete-oldest removes the oldest records without a download and notifies", async (t) => {
  const hub = hubAt(await tmp(t));
  hub.setConfig({ deletionRule: { type: "delete-oldest", threshold: 5, deleteCount: 2 } });
  const s = hub.store("errors");
  for (let i = 0; i < 5; i++) { s.put(`e${i}`, { text: `e${i}`, body: {} }); hub.enforce("errors"); }
  assert.equal(s.count(), 3);
  assert.equal(s.has("e0"), false);
  assert.equal(hub.store("notifications").search({ filter: "deleted" }).total, 1);
});

test("download-then-delete waits for the download, then deletes exactly what was sent", async (t) => {
  const hub = hubAt(await tmp(t));
  hub.setConfig({ deletionRule: { type: "download-then-delete", threshold: 3, deleteCount: 1 } });
  const s = hub.store("plans");
  for (let i = 0; i < 3; i++) { s.put(`p${i}`, { text: `p${i}`, body: { i } }); hub.enforce("plans"); }
  assert.equal(s.count(), 3, "nothing deleted before the download");
  assert.equal(s.pendingDownload, true);
  assert.equal(hub.store("notifications").search({ filter: "pending-download" }).total, 1);
  const { ids, json } = hub.exportDomain("plans");
  s.put("p3", { text: "p3", body: {} }); // arrives after the export was cut: must survive
  hub.finishDownload("plans", ids);
  assert.equal(JSON.parse(json).records.length, 3);
  assert.deepEqual(s.all().map((d) => d.id), ["p3"]);
  assert.equal(s.pendingDownload, false);
  assert.equal(hub.store("notifications").search({ filter: "deleted" }).total, 1);
});

test("notify-only deletes nothing and warns at the threshold", async (t) => {
  const hub = hubAt(await tmp(t));
  hub.setConfig({ deletionRule: { type: "notify-only", threshold: 2, deleteCount: 1 } });
  const s = hub.store("sessions");
  for (let i = 0; i < 3; i++) { s.put(`s${i}`, { text: `s${i}`, body: {} }); hub.enforce("sessions"); }
  assert.equal(s.count(), 3);
  assert.ok(hub.store("notifications").search({ filter: "size" }).total >= 1);
});

test("config is validated at the boundary", async (t) => {
  const hub = hubAt(await tmp(t));
  assert.equal(hub.setConfig({ deletionRule: { type: "rm -rf", threshold: 5 } }).ok, false);
  assert.equal(hub.setConfig({ deletionRule: { type: "notify-only", threshold: 0 } }).ok, false);
  assert.equal(hub.setConfig({ deletionRule: { type: "delete-oldest", threshold: 5, deleteCount: 9 } }).ok, false);
});
