import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { authHeaders, createServer, rawFetch } from "./helpers/authed-server.js";
import { SessionStore } from "../src/session-store.js";

async function setup(t) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mla-pub-"));
  const stateDir = path.join(tmp, "state");
  const srv = createServer({ store: new SessionStore(stateDir), stateDir, port: 0, version: "0.1.0" });
  const { baseUrl } = await srv.listen();
  t.after(async () => {
    await srv.close();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });
  return { baseUrl };
}

async function fetchAsset(baseUrl, name) {
  const res = await fetch(`${baseUrl}/${name}`);
  assert.equal(res.status, 200, `${name} status`);
  return res.text();
}

test("server serves every browser file", async (t) => {
  const { baseUrl } = await setup(t);
  for (const name of ["sdk.js", "logs-client.js", "logs.css", "home-client.js", "home.css", "errors-client.js", "errors.css"]) {
    await fetchAsset(baseUrl, name);
  }
});

test("browser scripts parse as classic scripts", async (t) => {
  const { baseUrl } = await setup(t);
  for (const name of ["sdk.js", "home-client.js", "logs-client.js", "errors-client.js"]) {
    const source = await fetchAsset(baseUrl, name);
    assert.doesNotThrow(() => new Function(source), `${name} has a syntax error`);
  }
});

test("sdk.js speaks the my-lavish message protocol", async (t) => {
  const { baseUrl } = await setup(t);
  const source = await fetchAsset(baseUrl, "sdk.js");
  assert.ok(source.includes('"my-lavish"'), "sdk.js tags messages with source \"my-lavish\"");
  assert.ok(source.includes("requestSnapshot"), "sdk.js answers requestSnapshot");
});

test("the Claude log page and its files are served", async (t) => {
  const { baseUrl } = await setup(t);
  const html = await (await fetch(`${baseUrl}/claude`)).text();
  assert.ok(html.includes('<div id="root"></div>') && html.includes('src="/app/main.js"'), "the log page is the React shell; its markup is asserted in src/tests/logs.test.ts");
  assert.ok(html.includes("data-error-log="), "the error log path is handed to the shell");
  const client = await fetchAsset(baseUrl, "logs-client.js");
  assert.doesNotThrow(() => new Function(client), "logs-client.js has a syntax error");
  assert.ok(!client.includes("innerHTML"), "transcript text is set with textContent only");
  assert.ok(client.includes("/api/claude-errors") && client.includes("/api/claude-sessions/"));
  assert.ok(client.includes("showModal") && client.includes("ctrlKey") && client.includes("metaKey"), "the dialog confirms with Ctrl/Cmd+Enter");
  assert.ok(client.includes("reason: reason || null"), "the reason is sent with the entry");
  await fetchAsset(baseUrl, "logs.css");
});

test("the repository is MIT licensed with an upstream notice", async () => {
  const root = new URL("../", import.meta.url);
  const license = await fs.promises.readFile(new URL("LICENSE", root), "utf8");
  assert.match(license, /^MIT License/);
  const pkg = JSON.parse(await fs.promises.readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.license, "MIT");
  assert.ok(pkg.files.includes("LICENSE") && pkg.files.includes("NOTICE") && !pkg.files.includes("test"));
  assert.match(await fs.promises.readFile(new URL("NOTICE", root), "utf8"), /lavish-axi.*Kun Chen/s);
});

// WCAG relative luminance and contrast ratio, for the severity badge colors.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("severity badges: plan colors, text at 4.5:1 or better in light and dark, in the legacy stylesheets", async (t) => {
  const { baseUrl } = await setup(t);
  const expected = {
    light: { low: "#E8730C", medium: "#F2B600", high: "#C62828", send_to_it: "#7B1E3A", unrated: "#6B7280" },
    dark: { low: "#FF9A3D", medium: "#FFC94D", high: "#FF5C5C", send_to_it: "#C2456A", unrated: "#9CA3AF" },
  };
  for (const name of ["errors.css", "logs.css"]) {
    const css = await fetchAsset(baseUrl, name);
    const start = css.indexOf("---- severity");
    assert.ok(start > 0, `${name} has the severity block`);
    const block = css.slice(start);
    const darkAt = block.indexOf("@media (prefers-color-scheme: dark)");
    for (const [mode, part] of [["light", block.slice(0, darkAt)], ["dark", block.slice(darkAt)]]) {
      for (const [sev, bg] of Object.entries(expected[mode])) {
        const got = new RegExp(`--sev-${sev}-bg: (#[0-9A-Fa-f]{6})`).exec(part)?.[1];
        const fg = new RegExp(`--sev-${sev}-fg: (#[0-9A-Fa-f]{6})`).exec(part)?.[1];
        assert.equal(got?.toUpperCase(), bg, `${name} ${mode} ${sev} background`);
        assert.ok(fg === "#000000" || fg === "#FFFFFF", `${name} ${mode} ${sev} text is black or white`);
        assert.ok(contrast(bg, fg) >= 4.5, `${name} ${mode} ${sev}: ${contrast(bg, fg).toFixed(2)}:1`);
      }
    }
  }
});

test("the /claude dialog offers four severity radios, none checked", async (t) => {
  const { baseUrl } = await setup(t);
  const html = await (await fetch(`${baseUrl}/claude`)).text();
  // The /claude dialog is a React component now: its four unchecked radios are asserted in src/tests/logs.test.ts.
  const client = await fetchAsset(baseUrl, "logs-client.js");
  assert.ok(client.includes("required for High and Send to IT") && client.includes("severity: severity"));

});

test("the errors page script builds the DOM with textContent only", async (t) => {
  const { baseUrl } = await setup(t);
  const client = await fetchAsset(baseUrl, "errors-client.js");
  assert.ok(!client.includes("innerHTML"));
  for (const route of ["/api/errors/summary", "/api/errors/record", "/api/errors/rate", "/api/projects/", "/plans/open", "/api/claude-sessions?limit=75"]) assert.ok(client.includes(route), route);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "encodeURIComponent", "document.hidden", "data-project", '[role="tab"]']) assert.ok(client.includes(key), key);
});
