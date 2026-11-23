import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DataHub } from "../helpers/data-hub.js";
import { narrowSessions } from "../helpers/session-filter.js";

const sessions = [
  { id: "a", title: "fix the database timeout" },
  { id: "b", title: "css colour contrast" },
  { id: "c", title: "database migration plan" },
];
const stage = { a: "implementation", b: "none", c: "plan" };

test("sessions are narrowed by vector search and by stage", async (t) => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-sf-"));
  const hub = new DataHub(path.join(tmp, "data"));
  t.after(async () => {
    hub.close();
    await fs.promises.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  });
  hub.index("sessions", sessions, (s) => ({ id: `claude_${s.id}`, text: s.title, filter: stage[s.id] }));
  const stageOf = (s) => stage[s.id];
  assert.equal(narrowSessions(hub, sessions, {}, stageOf).length, 3, "no search leaves the list alone");
  assert.deepEqual(narrowSessions(hub, sessions, { q: "database" }, stageOf).map((s) => s.id).sort(), ["a", "c"]);
  assert.deepEqual(narrowSessions(hub, sessions, { q: "database", filter: "plan" }, stageOf).map((s) => s.id), ["c"]);
  assert.deepEqual(narrowSessions(hub, sessions, { filter: "none" }, stageOf).map((s) => s.id), ["b"]);
  assert.equal(narrowSessions(hub, sessions, { filter: "a b;--" }, stageOf).length, 3, "a bad filter is ignored");
});
