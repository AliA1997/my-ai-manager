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
  for (const name of ["sdk.js", "output-render.js"]) {
    await fetchAsset(baseUrl, name);
  }
});

test("browser scripts parse as classic scripts", async (t) => {
  const { baseUrl } = await setup(t);
  for (const name of ["sdk.js", "output-render.js"]) {
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

test("severity badges: plan colors, text at 4.5:1 or better in light and dark, in the app stylesheet", async () => {
  const expected = {
    light: { low: "#E8730C", medium: "#F2B600", high: "#C62828", "send-to-it": "#7B1E3A", unrated: "#6B7280" },
    dark: { low: "#FF9A3D", medium: "#FFC94D", high: "#FF5C5C", "send-to-it": "#C2456A", unrated: "#9CA3AF" },
  };
  const css = await fs.promises.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
  const parts = { light: css.slice(0, darkAt), dark: css.slice(darkAt, css.indexOf("@theme")) };
  const pick = (part, name) => new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`).exec(part)?.[1];
  for (const mode of ["light", "dark"]) {
    for (const [sev, bg] of Object.entries(expected[mode])) {
      const got = pick(parts[mode], `sev-${sev}`);
      const fg = pick(parts[mode], `sev-${sev}-fg`) ?? pick(parts.light, `sev-${sev}-fg`);
      assert.equal(got?.toUpperCase(), bg, `${mode} ${sev} background`);
      assert.ok(contrast(bg, fg) >= 4.5, `${mode} ${sev}: ${contrast(bg, fg).toFixed(2)}:1`);
    }
  }
});
