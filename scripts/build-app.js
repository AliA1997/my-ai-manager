#!/usr/bin/env node
// Builds the React app into public/app/: main.js (+ code-split chunks), app.css (Tailwind) and manifest.json.
// The manifest lists every file here, so the server and build-sea.js know what to serve and embed (PUBLIC_ASSETS).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "app");
const tailwind = path.join(ROOT, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs");

fs.rmSync(OUT, { recursive: true, force: true }); // no stale chunks
fs.mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: { main: path.join(ROOT, "src", "main.tsx") },
  outdir: OUT,
  bundle: true,
  splitting: true, // PERF-3: each route is its own chunk
  format: "esm",
  target: "es2022",
  platform: "browser",
  jsx: "automatic",
  minify: true,
  chunkNames: "chunks/[name]-[hash]",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "warning",
});

execFileSync(process.execPath, [tailwind, "-i", path.join(ROOT, "src", "styles.css"), "-o", path.join(OUT, "app.css"), "--minify"], {
  cwd: ROOT,
  stdio: "inherit",
});

const files = fs
  .readdirSync(OUT, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && d.name !== "manifest.json")
  .map((d) => path.relative(path.join(ROOT, "public"), path.join(d.parentPath, d.name)).split(path.sep).join("/"))
  .sort();
fs.writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify({ files }, null, 2)}\n`);
console.log(`build-app: ${files.length} files in public/app/`);
