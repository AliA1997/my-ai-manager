#!/usr/bin/env node
// `npm start`: builds the React pages, links `see` onto the PATH if it is not there yet, runs the server in
// THIS terminal (interactive: press q or Ctrl+C to stop it) and opens the dashboard in the browser.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "see-plan.js");
const PORT = Number(process.env.MY_LAVISH_PORT) || 4388;
const run = (args, env = process.env) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit", env }).status ?? 1;
// npm is npm.cmd on Windows, which only runs through a shell. No user input reaches these fixed commands.
const npm = (args, stdio) => spawnSync("npm", args, { cwd: ROOT, stdio, shell: process.platform === "win32" });

/** True when `see` runs from this folder's checkout (a global npm link points at it). */
function linked() {
  const probe = spawnSync("see-plan", ["--version"], { cwd: path.parse(ROOT).root, encoding: "utf8", shell: process.platform === "win32" });
  return probe.status === 0;
}

const up = () =>
  new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The see-plan server process holding the port, when `see stop` could not reach it (another state folder). */
function seePlanPidOnPort() {
  const cmd =
    process.platform === "win32"
      ? ["powershell", ["-NoProfile", "-Command", `$p=(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){(Get-CimInstance Win32_Process -Filter "ProcessId=$p") | Where-Object { $_.CommandLine -match "see-plan" } | ForEach-Object { $_.ProcessId }}`]]
      : ["sh", ["-c", `pid=$(lsof -ti tcp:${PORT} -sTCP:LISTEN | head -n1); [ -n "$pid" ] && ps -o args= -p "$pid" | grep -q see && echo "$pid"`]];
  const out = spawnSync(cmd[0], cmd[1], { encoding: "utf8" }).stdout?.trim();
  return /^\d+$/.test(out ?? "") ? Number(out) : null;
}

/** Ends the process tree of a pid. */
function kill(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
  else process.kill(pid, "SIGKILL");
}

// Always rebuild: a stale public/app is why a page change (like the connect dialog) would not show up.
console.log("Building the pages...");
if (run([path.join("scripts", "build-app.js")]) !== 0) process.exit(1);

if (!linked()) {
  console.log("Linking `see` onto your PATH (npm link)...");
  const link = npm(["link"], "inherit");
  if (link.status === 0 && linked()) console.log("`see` is linked: you can now run it from any folder.");
  else console.log("Could not link `see` (npm link needs permission to write npm's global folder). Continuing without it; use `npm start` or `node bin/see-plan.js`.");
}

// A server left running in the background cannot be controlled from this terminal: stop it, then own the next one.
if (await up()) {
  console.log("A see-plan server is already running in the background; restarting it here so you can stop it from this terminal.");
  run([BIN, "stop"]);
  for (let i = 0; i < 30 && (await up()); i++) await sleep(100);
  if (await up()) {
    // stop could not reach it (it was started with another state folder): end that see process.
    const pid = seePlanPidOnPort();
    if (pid) kill(pid);
    for (let i = 0; i < 30 && (await up()); i++) await sleep(100);
  }
  if (await up()) {
    console.log(`Port ${PORT} is still in use by another program. Free it, or set MY_LAVISH_PORT to another port.`);
    process.exit(1);
  }
}

// The server stays up while this terminal is open: no idle shutdown.
const server = spawn(process.execPath, [BIN, "server"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, MY_LAVISH_IDLE_TIMEOUT_MS: "off" },
});

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping see-plan...");
  // The server's own clean shutdown (/shutdown), the same on every platform; a kill would skip its cleanup.
  spawnSync(process.execPath, [BIN, "stop"], { cwd: ROOT, stdio: "ignore" });
  // If it has not exited in 3 s, end it and its children: the port must be free when this terminal returns.
  for (let i = 0; i < 30 && server.exitCode === null && server.signalCode === null; i++) await sleep(100);
  if (server.exitCode === null && server.signalCode === null) kill(server.pid);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(stopping ? 0 : (code ?? 0)));

// Wait for the server to answer, then open the dashboard against it.
for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
if (await up()) {
  run([BIN, "dashboard"]);
  console.log("\nsee-plan is running. Press q (or Ctrl+C) to stop it.\n");
} else {
  console.log("The server did not start; see the messages above.");
  stop();
}

// q / Ctrl+C in a real terminal stops it. Raw mode is needed to read a single key without Enter.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key) => {
    if (key === "q" || key === "Q" || key === "\u0003") stop();
  });
}
