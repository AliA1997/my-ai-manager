import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE = "config.json";
export const RULES = Object.freeze(["download-then-delete", "delete-oldest", "notify-only"]);

/** Default: never delete anything, only warn when a domain grows past 10,000 records. */
export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  deletionRule: Object.freeze({ type: "notify-only", threshold: 10000, deleteCount: 1000 }),
});

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * Checks a config object at the boundary (SEC-12). Returns { ok: true, config } with defaults filled in,
 * or { ok: false, error }.
 */
export function validateConfig(input) {
  const rule = input?.deletionRule;
  if (!rule || typeof rule !== "object") return { ok: false, error: "deletionRule is required" };
  if (!RULES.includes(rule.type)) return { ok: false, error: `deletionRule.type must be one of ${RULES.join(", ")}` };
  if (!int(rule.threshold, 1, 10_000_000)) return { ok: false, error: "deletionRule.threshold must be a whole number from 1 to 10000000" };
  const deleteCount = rule.deleteCount ?? DEFAULT_CONFIG.deletionRule.deleteCount;
  if (rule.type === "delete-oldest" && !int(deleteCount, 1, rule.threshold)) {
    return { ok: false, error: "deletionRule.deleteCount must be a whole number from 1 up to the threshold" };
  }
  return { ok: true, config: { version: 1, deletionRule: { type: rule.type, threshold: rule.threshold, deleteCount } } };
}

/** Reads `data/config.json`; a missing or invalid file gives the defaults. */
export function readDataConfig(dir) {
  try {
    const result = validateConfig(JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), "utf8")));
    if (result.ok) return result.config;
  } catch {}
  return structuredClone(DEFAULT_CONFIG);
}

/** Writes the config file (JSON only: configuration has no vector index). Creates it when missing. */
export function writeDataConfig(dir, config) {
  const result = validateConfig(config);
  if (!result.ok) throw new Error(result.error);
  const file = path.join(dir, CONFIG_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result.config, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return result.config;
}

/** Writes the default config only when the file does not exist yet. */
export function ensureDataConfig(dir) {
  const file = path.join(dir, CONFIG_FILE);
  if (!fs.existsSync(file)) writeDataConfig(dir, DEFAULT_CONFIG);
}
