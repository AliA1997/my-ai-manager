import fs from "node:fs";
import path from "node:path";
import * as nodeSea from "node:sea";
import { fileURLToPath } from "node:url";

const BASE_ASSETS = ["sdk.js", "output-render.js", "vendor/mermaid.min.js"];

/** Written by scripts/build-app.js: every file of the React bundle (public/app/). */
const APP_MANIFEST = "app/manifest.json";

/** The files of the built React app, or none when it has not been built. Read from disk, or from the SEA blob. */
function appAssetNames() {
  try {
    const raw = isSea() ? Buffer.from(nodeSea.getAsset(APP_MANIFEST)) : fs.readFileSync(path.join(publicDir(), APP_MANIFEST));
    const { files } = JSON.parse(raw.toString("utf8"));
    return Array.isArray(files) ? [APP_MANIFEST, ...files.filter((f) => typeof f === "string" && f.startsWith("app/") && !f.includes("..") && /^[A-Za-z0-9._/-]+$/.test(f))] : [];
  } catch {
    return [];
  }
}

/** The browser files the server serves. In a single-executable build they are SEA assets with these names. */
export const PUBLIC_ASSETS = [...BASE_ASSETS, ...appAssetNames()];

export const CONTENT_TYPES = { ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

/** True inside a Node single executable application. */
export function isSea(sea = nodeSea) {
  try {
    return Boolean(sea?.isSea?.());
  } catch {
    return false;
  }
}

// Resolved only when needed: inside a SEA there is no module file to resolve against.
function publicDir() {
  return fileURLToPath(new URL("../public/", import.meta.url));
}

const cache = new Map();

/** Reads public/<name> from disk, or from the SEA blob when packaged. Refuses names outside PUBLIC_ASSETS. */
export function readAsset(name, { sea = nodeSea } = {}) {
  if (!PUBLIC_ASSETS.includes(name)) throw new Error(`Not a public asset: ${name}`);
  if (isSea(sea)) {
    if (!cache.has(name)) cache.set(name, Buffer.from(sea.getAsset(name)));
    return cache.get(name);
  }
  return fs.readFileSync(path.join(publicDir(), name)); // from disk: edits show up without a restart
}

/** How the CLI starts its background server: `<node> bin/see-plan.js server`, or `<exe> server` in a SEA. */
export function serverSpawnArgs({ sea = isSea(), binPath } = {}) {
  if (sea) return ["server"];
  return [binPath ?? fileURLToPath(new URL("../bin/see-plan.js", import.meta.url)), "server"];
}
