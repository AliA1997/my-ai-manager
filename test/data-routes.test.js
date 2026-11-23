import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DataHub } from "../helpers/data-hub.js";
import { LocalErrorStore } from "../src/error-store.js";
import { SessionStore } from "../src/session-store.js";
import { createServer } from "./helpers/authed-server.js";

async function world(t) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-dr-"));
  const hub = new DataHub(path.join(tmp, "data"));
  const errorStore = new LocalErrorStore(hub);
  const stateDir = path.join(tmp, "state");
  const srv = createServer({ store: new SessionStore(stateDir), stateDir, port: 0, version: "t", claudeDir: path.join(tmp, "c"), hub, errorStore, presenceGraceMs: 0 });
  const { baseUrl } = await srv.listen();
  // The server closes the SQLite files; only then can the folder be removed on Windows.
  t.after(async () => {
    await srv.close();
    await fs.promises.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  });
  const put = (p, body, headers = { Origin: baseUrl }) =>
    fetch(baseUrl + p, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { baseUrl, hub, errorStore, put };
}

const rec = (n, severity = null) => ({ claude_session_id: "s", uuid: `u${n}`, part: 0, text: `database timeout ${n}`, severity, reported_at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString() });

test("the errors list searches the vector index, filters by severity and paginates", async (t) => {
  const { baseUrl, errorStore } = await world(t);
  for (let i = 0; i < 6; i++) await errorStore.append(rec(i, i % 2 ? "high" : "low"));
  await errorStore.append({ ...rec(9), text: "css colour contrast" });
  const page2 = await (await fetch(`${baseUrl}/api/errors?q=database&pageSize=4&page=2`)).json();
  assert.deepEqual([page2.total, page2.page, page2.pages, page2.items.length], [6, 2, 2, 2]);
  const high = await (await fetch(`${baseUrl}/api/errors?severity=high&page=1&pageSize=10`)).json();
  assert.equal(high.total, 3);
  assert.equal((await fetch(`${baseUrl}/api/data/nope`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/data/errors?filter=${encodeURIComponent("a b;--")}`)).status, 400);
});

test("config is read and saved through the API, and bad settings are refused", async (t) => {
  const { baseUrl, put } = await world(t);
  assert.equal((await (await fetch(`${baseUrl}/api/data/config`)).json()).config.deletionRule.type, "notify-only");
  assert.equal((await put("/api/data/config", { deletionRule: { type: "delete-oldest", threshold: 10, deleteCount: 2 } }, {})).status, 403, "page origin required");
  assert.equal((await put("/api/data/config", { deletionRule: { type: "delete-oldest", threshold: 10, deleteCount: 2 } })).status, 200);
  assert.equal((await put("/api/data/config", { deletionRule: { type: "nope", threshold: 10 } })).status, 400);
  assert.equal((await (await fetch(`${baseUrl}/api/data/config`)).json()).config.deletionRule.deleteCount, 2);
});

test("download-then-delete: the export deletes what it sent and notifies", async (t) => {
  const { baseUrl, hub, errorStore, put } = await world(t);
  assert.equal((await put("/api/data/config", { deletionRule: { type: "download-then-delete", threshold: 3 } })).status, 200);
  for (let i = 0; i < 3; i++) await errorStore.append(rec(i));
  assert.equal(hub.store("errors").count(), 3, "nothing is deleted before the download");
  assert.equal((await (await fetch(`${baseUrl}/api/data/notifications?filter=pending-download`)).json()).total, 1);
  const res = await fetch(`${baseUrl}/api/data/errors/export`);
  assert.equal(JSON.parse(await res.text()).records.length, 3);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(hub.store("errors").count(), 0);
  assert.equal((await (await fetch(`${baseUrl}/api/data/notifications?filter=deleted`)).json()).total, 1);
  assert.equal((await fetch(`${baseUrl}/api/data/notifications/export`)).status, 404, "notifications are never exported or deleted");
});
