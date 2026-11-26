#!/usr/bin/env node
// UX rubric browser checks (docs/conventions/UX-RUBRIC.md): UX-1, 2, 4, 8, 11, 12, 13, 14, 16, 17.
// Runs against the user's installed Chrome only (channel "chrome"); it never downloads a browser.
// Usage: npm run build:app && npm run test:ux
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "see-plan.js");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "phone", width: 390, height: 844 },
];
const SCHEMES = ["light", "dark"];
const TABS = 30;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function cli(env, args) {
  const out = execFileSync(process.execPath, [CLI, ...args, "--json"], { cwd: ROOT, env, encoding: "utf8", timeout: 60_000 });
  return JSON.parse(out);
}

const failures = [];
const passes = new Map();
function check(id, ok, where, detail = "") {
  const key = id;
  if (!passes.has(key)) passes.set(key, true);
  if (!ok) {
    passes.set(key, false);
    failures.push(`${id} ${where}${detail ? `: ${detail}` : ""}`);
  }
}

async function auditPage(page, label, { isSession }) {
  // UX-1: the gradient nav bar with the product name and page links.
  const nav = await page.evaluate(() => {
    const links = document.querySelector('header nav[aria-label="Pages"]');
    const bar = links?.parentElement;
    const bg = bar ? getComputedStyle(bar).backgroundImage : "";
    const brand = bar?.querySelector("a")?.textContent?.trim() ?? "";
    const current = [...(links?.querySelectorAll('[aria-current="page"]') ?? [])];
    const pills = [...(links?.querySelectorAll("a") ?? [])].map((a) => parseFloat(getComputedStyle(a).borderTopLeftRadius));
    return { found: Boolean(links), gradient: bg.includes("linear-gradient"), brand, current: current.length, pills, position: bar ? getComputedStyle(bar.parentElement).position : "" };
  });
  check("UX-1", nav.found && nav.gradient && nav.brand === "My AI Manager", label, JSON.stringify({ found: nav.found, gradient: nav.gradient, brand: nav.brand }));
  check("UX-3", nav.position === "sticky", label, `header position ${nav.position}`);
  if (!isSession) check("UX-2", nav.current === 1, label, `${nav.current} links marked aria-current`);
  // UX-12: nav links are pills.
  check("UX-12", nav.pills.length > 0 && nav.pills.every((r) => r >= 100), label, `nav link radii ${nav.pills.join(",")}`);

  // UX-4: no horizontal page scroll.
  const overflow = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".overflow-x-auto, .overflow-auto, nav"));
    const el = wide.at(-1);
    return { over, culprit: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")}` : "" };
  });
  check("UX-4", overflow.over <= 1, label, `page scrolls ${overflow.over}px sideways (${overflow.culprit})`);

  // UX-11: sans UI font; mono log bodies when there are log entries.
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    log: [...document.querySelectorAll("article .font-mono")].slice(0, 1).map((el) => getComputedStyle(el).fontFamily)[0] ?? null,
  }));
  check("UX-11", /system-ui/.test(fonts.body), label, `body font ${fonts.body}`);
  if (fonts.log) check("UX-11", /monospace|Consolas/.test(fonts.log), label, `log font ${fonts.log}`);

  // UX-17: exactly one h1.
  const h1 = await page.locator("h1").count();
  check("UX-17", h1 === 1, label, `${h1} h1 elements`);

  // UX-13, UX-16 and the rest of axe: no serious or critical issue. The artifact iframe is the agent's page, not ours.
  const axe = await new AxeBuilder({ page }).exclude("iframe").analyze();
  const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of bad) {
    const id = v.id === "color-contrast" ? "UX-13" : v.id === "label" || v.id === "select-name" ? "UX-16" : "UX-axe";
    check(id, false, label, `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`);
  }
  check("UX-13", true, label);
  check("UX-16", true, label);

  // UX-14: Tab moves through distinct elements, each with a visible focus indicator.
  // An open modal <dialog> traps focus on purpose (A11Y-4): then Tab must stay inside it.
  const modal = await page.evaluate(() => Boolean(document.querySelector("dialog[open]:modal")));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const seen = new Set();
  for (let i = 0; i < TABS; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.tagName === "IFRAME") return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      return { inDialog: Boolean(el.closest("dialog[open]")), key: `${el.tagName}#${el.id}.${el.className}:${el.textContent?.trim().slice(0, 30)}:${[...el.parentNode.children].indexOf(el)}`, ring, name: el.textContent?.trim().slice(0, 40) || el.getAttribute("aria-label") || el.tagName };
    });
    if (!f) continue;
    if (!f.ring) check("UX-14", false, label, `no focus ring on "${f.name}"`);
    if (modal && !f.inDialog) check("UX-14", false, label, `focus left the open dialog for "${f.name}"`);
    seen.add(f.key);
  }
  if (modal) {
    check("UX-14", seen.size >= 1, label, "Tab reached nothing in the open dialog");
  } else {
    check("UX-14", seen.size >= 5, label, `Tab reached only ${seen.size} elements`);
  }
}

async function main() {
  const port = await freePort();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mla-ux-"));
  const env = { ...process.env, MY_LAVISH_PORT: String(port), MY_LAVISH_STATE_DIR: stateDir };
  let browser;
  try {
    // UX rubric Q15: seed one session from the example plan.
    const opened = cli(env, ["open", "examples/plan.html", "--no-open"]);
    const sessionPath = new URL(opened.session.url).pathname;
    const pages = [
      { path: "/", isSession: false },
      { path: "/claude", isSession: false },
      { path: "/errors", isSession: false },
      { path: "/notifications", isSession: false },
      { path: "/help", isSession: false },
      { path: sessionPath, isSession: true },
    ];

    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch (e) {
      console.error(`FAIL: could not start the installed Chrome (channel "chrome"). No checks ran.\n${e.message.split("\n")[0]}`);
      process.exitCode = 1;
      return;
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(cli(env, ["url", "dashboard"]).url, { waitUntil: "networkidle" });

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const p of pages) {
          const label = `${p.isSession ? "/session" : p.path} @${vp.width} ${scheme}`;
          await page.goto(`http://127.0.0.1:${port}${p.path}`, { waitUntil: "networkidle" });
          await page.waitForSelector('header nav[aria-label="Pages"]', { timeout: 15_000 }).catch(() => {});
          // UX-8: dark mode swaps the page background.
          const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          const dark = bg === "rgb(18, 13, 23)";
          check("UX-8", scheme === "dark" ? dark : !dark, label, `body background ${bg}`);
          await auditPage(page, label, p);
        }
      }
    }
  } finally {
    await browser?.close();
    try {
      cli(env, ["stop"]);
    } catch {
      /* already stopped */
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }

  if (process.exitCode) return;
  for (const [id, ok] of [...passes].sort()) console.log(`${ok ? "PASS" : "FAIL"} ${id}`);
  if (failures.length) {
    console.log(`\n${failures.length} problem(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll UX browser checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
