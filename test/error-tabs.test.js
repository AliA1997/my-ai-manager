import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "./helpers/authed-server.js";
import { planStatus } from "../src/server.js";
import { SessionStore } from "../src/session-store.js";
import { DataHub } from "../helpers/data-hub.js";
import { LocalErrorStore } from "../src/error-store.js";
import { appendErrorLog, listErrorRecords, rateErrorRecord, summarizeErrorRecords } from "../src/error-log.js";
import { isSeverity, SEVERITIES } from "../src/severity.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1); // attached to a plan-folder review session
const B = id(2); // attached to a plain review session
const C = id(3); // attached to nothing

async function world(t, { transcripts = 3, opts = {} } = {}) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-tabs-"));
  const claudeDir = path.join(tmp, "claude");
  const claudeProject = path.join(claudeDir, "projects", "C--repo");
  await fs.promises.mkdir(claudeProject, { recursive: true });
  for (let n = 1; n <= transcripts; n++) {
    const file = path.join(claudeProject, `${id(n)}.jsonl`);
    await fs.promises.writeFile(file, JSON.stringify({ type: "user", cwd: "/repo", message: { content: `session ${n}` } }) + "\n");
    const when = new Date(Date.now() - n * 60000);
    await fs.promises.utimes(file, when, when);
  }
  const stateDir = path.join(tmp, "state");
  const store = new SessionStore(stateDir);
  const hub = new DataHub(path.join(tmp, "data"));
  const errorStore = new LocalErrorStore(hub);
  const srv = createServer({ store, stateDir, port: 0, version: "3.2.0", claudeDir, hub, errorStore, presenceGraceMs: 0, projectHome: tmp, ...opts });
  const { baseUrl } = await srv.listen();
  // The server closes the data folder's SQLite files first; Windows cannot delete open files.
  t.after(async () => {
    await srv.close();
    await fs.promises.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  });
  const repo = path.join(tmp, "repo");
  const post = (p, body, headers = { Origin: baseUrl }) =>
    fetch(baseUrl + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const get = async (p, headers = {}) => {
    const res = await fetch(baseUrl + p, { headers });
    return { status: res.status, body: await res.json() };
  };
  async function open(rel, attach) {
    const file = path.join(repo, rel);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, "<html><body>x</body></html>");
    const { key } = await (await post("/api/sessions", { file }, {})).json();
    if (attach) assert.equal((await post(`/api/${key}/claude-session`, { id: attach }, {})).status, 200);
    return key;
  }
  let uuid = 0;
  const entry = (claude, extra = {}) => ({ claude_session_id: claude, uuid: `u-${++uuid}`, part: 0, role: "assistant", kind: "text", at: null, text: "oops", severity: "low", ...extra });
  async function log(e) {
    const res = await post("/api/claude-errors", { entry: e });
    return { status: res.status, body: await res.json() };
  }
  /** Makes tmp/repo a project (a .git folder), registers it and returns its key. */
  async function project() {
    await fs.promises.mkdir(path.join(repo, ".git"), { recursive: true });
    const res = await post("/api/projects", { dir: repo }, {});
    const body = await res.json();
    assert.equal(res.status, 200);
    return body.project.key;
  }
  return { tmp, repo, baseUrl, store, errorStore, post, get, open, entry, log, project };
}

test("isSeverity takes only the four ids, never prototype keys", () => {
  for (const s of SEVERITIES) assert.ok(isSeverity(s));
  for (const bad of ["__proto__", "constructor", "toString", "LOW", "", null, undefined, 1, ["low"], { low: 1 }]) assert.equal(isSeverity(bad), false, String(bad));
});

test("a logged entry needs a valid severity; High and Send to IT need a reason", async (t) => {
  const { log, entry } = await world(t);
  for (const severity of SEVERITIES) {
    const reason = severity === "high" || severity === "send_to_it" ? "lost the plan" : undefined;
    const r = await log(entry(C, { severity, reason }));
    assert.deepEqual([r.status, r.body.severity], [200, severity], severity);
  }
  for (const bad of [undefined, "urgent", 42, "__proto__", "constructor", ["low"]]) {
    const r = await log(entry(C, { severity: bad }));
    assert.deepEqual([r.status, r.body.error.code], [400, "VALIDATION_ERROR"], String(bad));
    assert.match(r.body.error.message, /severity must be one of low, medium, high, send_to_it/);
  }
  for (const severity of ["high", "send_to_it"]) {
    for (const reason of [undefined, null, "", "   "]) {
      const r = await log(entry(C, { severity, reason }));
      assert.deepEqual([r.status, r.body.error.message], [400, "High and Send to IT need a reason"], `${severity} ${reason}`);
    }
  }
});

test("a duplicate keeps the first severity and returns it; the log response carries severities", async (t) => {
  const { log, entry, get } = await world(t);
  const e = entry(C, { severity: "medium" });
  assert.equal((await log(e)).body.status, "logged");
  const again = await log({ ...e, severity: "send_to_it", reason: "worse" });
  assert.deepEqual([again.status, again.body.status, again.body.severity, again.body.reason], [200, "already_logged", "medium", null]);
  const page = await get(`/api/claude-sessions/${C}/log`);
  assert.deepEqual(page.body.severities, { [`${e.uuid}:0`]: "medium" });
});

test("records are classified from the Claude session id alone, at log time", async (t) => {
  const { open, log, entry, store, errorStore, post } = await world(t);
  const planKey = await open("docs/superpowers/plans/2026-11-04-x.html", A);
  const plainKey = await open("notes/review.html", B);
  const interKey = await open("notes/auth-interrogation.html", id(3));

  await log(entry(A, { context: "session", review_key: plainKey, stage: "implementation", key: plainKey }));
  await log(entry(B, { context: "plan" }));
  await log(entry(id(3)));
  await log(entry(id(9)));
  let records = errorStore.records();
  assert.deepEqual(records.map((r) => [r.context, r.review_key, r.stage]), [
    ["plan", planKey, "plan"],
    ["session", plainKey, null],
    ["session", interKey, "interrogation"],
    ["session", null, null],
  ], "client-sent context, stage and key are ignored; interrogation errors are session errors");
  assert.ok(records.every((r) => !("key" in r)));

  // Relabelled after logging: the stored context stays.
  assert.equal((await post(`/api/${planKey}/stage`, { stage: "implementation" })).status, 200);
  const list = await errorStore.list({ context: "plan" }, new Map());
  assert.equal(list.total, 1);

  // Two review sessions attached to one Claude session: the most recently updated wins.
  const later = await open("docs/superpowers/plans/second.html", B);
  await log(entry(B));
  records = errorStore.records();
  assert.deepEqual([records.at(-1).context, records.at(-1).review_key], ["plan", later]);
  await store.transact((state) => {
    state.sessions[plainKey].updated_at = new Date(Date.now() + 60000).toISOString();
    return [null, true];
  });
  await log(entry(B));
  records = errorStore.records();
  assert.deepEqual([records.at(-1).context, records.at(-1).review_key], ["session", plainKey]);
});

test("a record saved before 0.3.0 (no context, no severity) is classified on read and shows as Unrated", async (t) => {
  const { open, get, errorStore } = await world(t);
  const planKey = await open("specs/design.html", A);
  errorStore.importRecords([
    { claude_session_id: A, uuid: "old", part: 0, role: "user", kind: "text", at: null, text: "old", reason: null, reported_at: "2026-10-01T00:00:00.000Z" },
    { note: "not a record" },
  ]);
  const plan = await get("/api/errors?context=plan");
  assert.equal(plan.status, 200);
  assert.deepEqual(plan.body.items.map((i) => [i.uuid, i.severity, i.review_key, i.context]), [["old", null, planKey, "plan"]]);
  assert.equal((await get("/api/errors?context=session")).body.total, 0);
  const summary = await get("/api/errors/summary");
  assert.equal(summary.body.counts.plan.unrated, 1);
});

test("an Unrated record can be rated once; High needs a reason; other origins are refused", async (t) => {
  const { post, errorStore, get, baseUrl } = await world(t);
  const old = (uuid, reason = null) => ({ claude_session_id: C, uuid, part: 0, role: "user", kind: "text", at: null, text: "t", reason, reported_at: "2026-10-01T00:00:00.000Z" });
  errorStore.importRecords([old("a"), old("b"), old("c", "had one")]);
  const rate = async (body, headers) => {
    const res = await post("/api/errors/rate", { claude_session_id: C, part: 0, ...body }, headers);
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await rate({ uuid: "a", severity: "low" }, {})).status, 403, "header-less calls are refused");
  assert.equal((await rate({ uuid: "a", severity: "low" }, { Origin: "http://evil.example" })).status, 403);
  assert.deepEqual((await rate({ uuid: "a", severity: "__proto__" })).body.error.code, "VALIDATION_ERROR");
  const noReason = await rate({ uuid: "a", severity: "high" });
  assert.deepEqual([noReason.status, noReason.body.error.message], [400, "High and Send to IT need a reason"]);
  const ok = await rate({ uuid: "a", severity: "high", reason: " lost context " });
  assert.deepEqual([ok.status, ok.body.severity, ok.body.reason], [200, "high", "lost context"]);
  const twice = await rate({ uuid: "a", severity: "low" });
  assert.deepEqual([twice.status, twice.body.error.code], [409, "ALREADY_RATED"]);
  const kept = await rate({ uuid: "c", severity: "send_to_it", reason: "ignored" });
  assert.deepEqual([kept.status, kept.body.reason], [200, "had one"], "a record that has a reason keeps it");
  assert.equal((await rate({ uuid: "zzz", severity: "low" })).status, 404);
  assert.equal((await rate({ uuid: "b", part: 1, severity: "low" })).status, 404, "matched by uuid and part");
  const items = (await get("/api/errors")).body.items;
  assert.deepEqual(Object.fromEntries(items.map((i) => [i.uuid, i.severity])), { a: "high", b: null, c: "send_to_it" });
  assert.ok(baseUrl);
});

test("the error log cache is cleared after append and rate, and notices outside edits", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-cache-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "log.json");
  const rec = (uuid, severity) => ({ claude_session_id: C, uuid, part: 0, text: "x", severity, reported_at: new Date().toISOString() });
  assert.equal((await listErrorRecords(file, {})).total, 0);
  await appendErrorLog(file, rec("1", "low"));
  assert.equal((await listErrorRecords(file, {})).total, 1);
  await appendErrorLog(file, rec("2"));
  assert.equal((await listErrorRecords(file, { severity: "unrated" })).total, 1);
  await rateErrorRecord(file, { claude_session_id: C, uuid: "2", part: 0 }, "medium");
  assert.equal((await listErrorRecords(file, { severity: "unrated" })).total, 0);
  await fs.promises.writeFile(file, JSON.stringify([rec("1", "low"), rec("2", "low"), rec("3", "low")]));
  assert.equal((await listErrorRecords(file, { severity: "low" })).total, 3);
  const s = await summarizeErrorRecords(file, new Map());
  assert.deepEqual([s.counts.session.all, s.bySession.get(C)], [3, { count: 3, worst: "low" }]);
});

test("GET /api/errors filters, validates, pages and previews; record and summary routes", async (t) => {
  const { log, entry, get, open } = await world(t);
  await open("plans/p.html", A);
  for (let i = 0; i < 5; i++) await log(entry(C, { severity: i % 2 ? "medium" : "low", text: i === 0 ? "x".repeat(600) : `t${i}` }));
  await log(entry(A, { severity: "send_to_it", reason: "ran unsupervised" }));

  const all = await get("/api/errors?context=session");
  assert.equal(all.status, 200, "/api/errors is not caught by /api/:key");
  assert.deepEqual([all.body.total, all.body.items.length, all.body.next_offset], [5, 5, null]);
  assert.deepEqual(all.body.items.map((i) => i.text.slice(0, 2)), ["t4", "t3", "t2", "t1", "xx"], "newest first");
  const long = all.body.items.at(-1);
  assert.deepEqual([long.text.length, long.truncated, long.claude_title], [500, true, "session 3"]);
  const full = await get(`/api/errors/record?claude_session_id=${C}&uuid=${long.uuid}&part=0`);
  assert.deepEqual([full.status, full.body.record.text.length, full.body.record.truncated], [200, 600, false]);
  assert.equal((await get(`/api/errors/record?claude_session_id=${C}&uuid=nope&part=0`)).status, 404);
  assert.equal((await get(`/api/errors/record?claude_session_id=../x&uuid=a&part=0`)).status, 400);

  assert.equal((await get("/api/errors?context=session&severity=medium")).body.total, 2);
  assert.equal((await get("/api/errors?context=session&severity=unrated")).body.total, 0);
  const plan = await get("/api/errors?context=plan");
  assert.deepEqual(plan.body.items.map((i) => [i.severity, i.reason, path.basename(i.file)]), [["send_to_it", "ran unsupervised", "p.html"]]);

  const page1 = await get("/api/errors?limit=2");
  assert.deepEqual([page1.body.items.length, page1.body.next_offset, page1.body.total], [2, 2, 6]);
  const page3 = await get("/api/errors?limit=2&offset=4");
  assert.deepEqual([page3.body.items.length, page3.body.next_offset], [2, null]);
  assert.equal((await get("/api/errors?limit=abc")).body.items.length, 6, "a non-number falls back to the default");
  assert.equal((await get("/api/errors?limit=2.9")).body.items.length, 2, "rounded down");
  assert.equal((await get("/api/errors?limit=-5")).body.items.length, 1, "clamped to 1");
  assert.equal((await get("/api/errors?offset=-3")).body.items.length, 6, "clamped to 0");
  for (const bad of ["context=all", "context=__proto__", "severity=urgent", "severity=constructor", "context=plan&context=session"]) {
    const r = await get(`/api/errors?${bad}`);
    assert.deepEqual([r.status, r.body.error.code], [400, "VALIDATION_ERROR"], bad);
  }

  const summary = await get("/api/errors/summary");
  assert.equal(summary.body.plans, null, "no project: no plan count");
  assert.deepEqual(summary.body.counts.session, { all: 5, low: 3, medium: 2, high: 0, send_to_it: 0, unrated: 0 });
  assert.deepEqual(summary.body.counts.plan, { all: 1, low: 0, medium: 0, high: 0, send_to_it: 1, unrated: 0 });

  for (const p of ["/api/errors", "/api/errors/summary", `/api/errors/record?claude_session_id=${C}&uuid=a&part=0`, "/api/projects", "/api/claude-sessions"]) {
    assert.equal((await get(p, { "Sec-Fetch-Site": "cross-site" })).status, 403, p);
  }
});

test("planStatus maps review session states; archived wins", () => {
  assert.equal(planStatus({ status: "open" }), "Open");
  assert.equal(planStatus({ status: "feedback" }), "Needs changes");
  assert.equal(planStatus({ status: "ended", ended_by: "approved" }), "Approved");
  assert.equal(planStatus({ status: "ended", ended_by: "user" }), "Ended");
  assert.equal(planStatus({ status: "ended", ended_by: "approved", archived: true }), "Archived");
});

test("the project Plans tab lists docs/superpowers/plans files, joined with review sessions and error counts", async (t) => {
  const { open, get, store, log, entry, project, repo } = await world(t);
  const key = await project();
  const dir = path.join(repo, "docs", "superpowers", "plans");
  await fs.promises.mkdir(dir, { recursive: true });
  for (let i = 1; i <= 52; i++) await fs.promises.writeFile(path.join(dir, `2026-01-${String((i % 28) + 1).padStart(2, "0")}-p${String(i).padStart(2, "0")}.md`), `# Plan ${i}\n`);
  await fs.promises.writeFile(path.join(dir, "2026-02-01-new.md"), "# Newest plan\n");
  const opened = await open("docs/superpowers/plans/2026-02-02-opened.html", A);
  await open("notes/feature-plan.html"); // a plan outside the plans folder is not listed
  await store.transact((state) => {
    state.sessions[opened].status = "ended";
    state.sessions[opened].ended_by = "approved";
    return [null, true];
  });
  await log(entry(A, { severity: "high", reason: "off course" }));
  await log(entry(A, { severity: "low" }));

  const { status, body } = await get(`/api/projects/${key}/plans`);
  assert.equal(status, 200);
  assert.equal(body.items.length, 50, "capped at 50");
  assert.equal(body.total, 50);
  assert.deepEqual(body.items.slice(0, 2).map((p) => p.name), ["2026-02-02-opened.html", "2026-02-01-new.md"], "newest created first");
  const [first, second] = body.items;
  assert.deepEqual([first.status, first.error_count, first.worst_severity, first.url, first.stage], ["Approved", 2, "high", `/session/${opened}`, "plan"]);
  assert.deepEqual([second.status, second.title, second.review_key, second.url], ["Not opened", "Newest plan", null, null]);
  assert.ok(!body.items.some((p) => p.name.includes("feature-plan")));
  assert.equal((await get(`/api/errors/summary?project=${key}`)).body.plans, 50);
  assert.equal((await get(`/api/projects/${key}/plans`, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await get("/api/projects/0123456789abcdef/plans")).status, 404, "an unregistered key");
  assert.equal((await get("/api/projects/__proto__/plans")).status, 404, "a malformed key");
});

test("Open on a plan creates its review session (stage plan); only names in the listing are accepted", async (t) => {
  const { post, get, project, repo } = await world(t);
  const key = await project();
  const dir = path.join(repo, "docs", "superpowers", "plans");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "2026-03-01-a.md"), "# A\n");
  await fs.promises.writeFile(path.join(repo, "secret.md"), "# not a plan\n");
  for (const name of ["../../secret.md", "..\\secret.md", "/etc/passwd", "2026-03-01-a.txt", "", 5]) {
    const r = await post(`/api/projects/${key}/plans/open`, { name });
    assert.equal(r.status, 400, String(name));
  }
  assert.equal((await post(`/api/projects/${key}/plans/open`, { name: "missing.md" })).status, 404);
  assert.equal((await post(`/api/projects/${key}/plans/open`, { name: "2026-03-01-a.md" }, {})).status, 403, "needs the page's origin");
  assert.equal((await post(`/api/projects/${key}/plans/open`, { name: "2026-03-01-a.md" }, { Origin: "http://evil.test" })).status, 403);
  const res = await post(`/api/projects/${key}/plans/open`, { name: "2026-03-01-a.md" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(body.key, /^[0-9a-f]{16}$/);
  assert.deepEqual([body.url, body.stage], [`/session/${body.key}`, "plan"]);
  assert.ok(fs.existsSync(path.join(dir, "2026-03-01-a.html")), "the HTML is generated next to the Markdown");
  const listed = (await get(`/api/projects/${key}/plans`)).body.items;
  assert.deepEqual(listed.map((p) => [p.name, p.status, p.review_key]), [["2026-03-01-a.md", "Open", body.key]], "the generated .html is not listed twice");
});

test("POST /api/projects registers only project roots; non-project folders and cross-site requests are refused", async (t) => {
  const { post, get, tmp, repo } = await world(t);
  const plain = path.join(tmp, "plain", "deep");
  await fs.promises.mkdir(plain, { recursive: true });
  const none = await (await post("/api/projects", { dir: plain }, {})).json();
  assert.deepEqual(none, { project: null, url: "/errors" });
  await fs.promises.mkdir(path.join(repo, ".git"), { recursive: true });
  await fs.promises.mkdir(path.join(repo, "src", "lib"), { recursive: true });
  const nested = await (await post("/api/projects", { dir: path.join(repo, "src", "lib") }, {})).json();
  assert.equal(nested.project.name, "repo");
  assert.equal(nested.project.root, await fs.promises.realpath(repo));
  assert.equal(nested.url, `/errors?project=${nested.project.key}`);
  const again = await (await post("/api/projects", { dir: repo }, {})).json();
  assert.equal(again.project.key, nested.project.key, "the key is stable");
  assert.deepEqual((await get("/api/projects")).body.projects.map((p) => p.key), [nested.project.key]);
  for (const dir of ["relative/path", "", 7, null]) assert.equal((await post("/api/projects", { dir }, {})).status, 400, String(dir));
  assert.equal((await post("/api/projects", { dir: repo }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post("/api/projects", { dir: repo }, { Origin: "http://evil.test" })).status, 403);
});

test("GET /api/claude-sessions: limit up to 75, with review session, stage and error counts", async (t) => {
  const { get, open, log, entry } = await world(t, { transcripts: 76 });
  const planKey = await open("plans/a.html", A);
  await log(entry(A, { severity: "medium" }));
  await log(entry(A, { severity: "send_to_it", reason: "malicious" }));
  const def = await get("/api/claude-sessions");
  assert.equal(def.body.sessions.length, 20);
  const max = await get("/api/claude-sessions?limit=1000");
  assert.equal(max.body.sessions.length, 75, "a 76th session is not returned");
  assert.ok(!max.body.sessions.some((s) => s.id === id(76)), "the oldest is the one left out");
  const a = max.body.sessions.find((s) => s.id === A);
  assert.deepEqual([a.review_key, a.stage, a.context, a.error_count, a.worst_severity], [planKey, "plan", "plan", 2, "send_to_it"]);
  const b = max.body.sessions.find((s) => s.id === B);
  assert.deepEqual([b.review_key, b.stage, b.error_count, b.worst_severity], [null, null, 0, null]);
});

test("/errors is the React shell for every project value; its tabs are covered in src/tests/pages.test.ts (D13)", async (t) => {
  const { baseUrl, project } = await world(t);
  const key = await project();
  for (const query of ["", `?project=${key}`, "?project=0123456789abcdef", "?project=%3Cscript%3E"]) {
    const res = await fetch(`${baseUrl}/errors${query}`);
    assert.equal(res.status, 200, query);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'.*frame-ancestors 'none'/);
    const html = await res.text();
    assert.ok(html.includes('<div id="root"></div>') && html.includes('src="/app/main.js"') && html.includes('href="/app/app.css"'), query);
    assert.ok(!html.includes("<script>") && !html.includes("%3Cscript"), "the query is never written into the shell");
  }

  assert.ok((await (await fetch(`${baseUrl}/`)).text()).includes('<div id="root"></div>'), "the dashboard is the React shell; its Error logs link is asserted in src/tests/home.test.ts");
  const claude = await (await fetch(`${baseUrl}/claude`)).text();
  assert.ok(claude.includes('<div id="root"></div>'), "/claude is the React shell; its links are asserted in src/tests/logs.test.ts");
  assert.equal((await fetch(`${baseUrl}/claude?project=${key}`)).status, 200);
});

test("timing budgets: /api/errors warm under 50ms with 2,000 records; sessions warm under 100ms, cold under 1.5s", async (t) => {
  const { get, errorStore } = await world(t, { transcripts: 75 });
  const records = Array.from({ length: 2000 }, (_, i) => ({
    claude_session_id: id((i % 75) + 1), uuid: `r-${i}`, part: 0, role: "assistant", kind: "text", at: null,
    text: "y".repeat(300), reason: null, severity: SEVERITIES[i % 4], context: i % 3 ? "session" : "plan", review_key: null, stage: null,
    reported_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  }));
  errorStore.importRecords(records);
  let t0 = performance.now();
  assert.equal((await get("/api/claude-sessions?limit=75")).body.sessions.length, 75);
  const cold = performance.now() - t0;
  assert.ok(cold < 1500, `sessions cold ${cold}ms`);
  t0 = performance.now();
  await get("/api/claude-sessions?limit=75");
  const warm = performance.now() - t0;
  assert.ok(warm < 100, `sessions warm ${warm}ms`);
  await get("/api/errors?context=session"); // warm the caches
  t0 = performance.now();
  const page = await get("/api/errors?context=session");
  const errorsWarm = performance.now() - t0;
  assert.equal(page.body.items.length, 50);
  assert.ok(errorsWarm < 50, `/api/errors warm ${errorsWarm}ms`);
});

test("an unlabeled session from before 0.3.0 still counts as a plan by its path, without being rewritten", async (t) => {
  const { open, get, store, log, entry, project } = await world(t);
  const planKey = await open("docs/superpowers/plans/old.html", A);
  const otherKey = await open("notes/old.html", B);
  // Sessions created before path inference have no stage until they are resumed.
  await store.transact((state) => {
    for (const s of Object.values(state.sessions)) {
      delete s.stage;
      delete s.stage_source;
    }
    return [null, true];
  });
  const key = await project();
  const plans = (await get(`/api/projects/${key}/plans`)).body.items;
  assert.deepEqual(plans.map((p) => [p.review_key, p.stage]), [[planKey, "plan"]]);
  assert.equal((await log(entry(A))).status, 200);
  assert.equal((await log(entry(B))).status, 200);
  assert.deepEqual((await get("/api/errors?context=plan")).body.items.map((i) => [i.review_key, i.stage]), [[planKey, "plan"]]);
  assert.deepEqual((await get("/api/errors?context=session")).body.items.map((i) => i.review_key), [otherKey]);
  const sessions = (await get("/api/claude-sessions")).body.sessions;
  assert.equal(sessions.find((s) => s.id === A).stage, "plan");
  assert.equal(sessions.find((s) => s.id === B).stage, null);
  assert.equal((await store.getSession(planKey)).stage, undefined); // read-only fallback
});
