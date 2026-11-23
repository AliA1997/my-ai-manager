import fs from "node:fs";
import path from "node:path";

/** The four stored domains (BE-3): each gets its own folder under `data/`. */
export const DOMAINS = Object.freeze(["errors", "notifications", "sessions", "plans"]);

/** Where the data folder lives: MY_LAVISH_DATA_DIR, else `data/` in the project the server runs from (BE-2). */
export function dataDirFor({ env = process.env, cwd = process.cwd() } = {}) {
  return path.resolve(env.MY_LAVISH_DATA_DIR || path.join(cwd, "data"));
}

/**
 * Creates `data/` and one folder per domain, only for what is missing. Never touches existing files.
 * Returns { dir, created } where `created` is true when `data/` did not exist before this call.
 */
export function ensureDataDir(dir) {
  const created = !fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const domain of DOMAINS) fs.mkdirSync(path.join(dir, domain), { recursive: true });
  return { dir, created };
}
