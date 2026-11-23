// Shared git helpers for discover.mjs and scan.mjs. Prints nothing itself.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const SKIP = /(^|\/)(node_modules|dist|build|coverage|\.git)\/|(^|\/)public\/vendor\/|\.min\.|package-lock\.json$/;
export const CODE = /\.(m?[jt]sx?|html|css)$/;

/**
 * Map of changed file -> Set of added line numbers.
 * An untracked file maps to null, meaning "every line is new".
 * `base` compares the working tree to that ref (default HEAD).
 */
export function changedLines(base = 'HEAD') {
  const out = new Map();
  const diff = git(['diff', '-U0', '--no-color', '--diff-filter=AMR', base, '--']);
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
      if (file) out.set(file, new Set());
    } else if (file && line.startsWith('@@')) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) out.get(file).add(start + i);
    }
  }
  for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n')) {
    if (f) out.set(f, null);
  }
  for (const f of [...out.keys()]) {
    if (SKIP.test(f) || !CODE.test(f) || !existsSync(f)) out.delete(f);
  }
  return out;
}

export const readLines = (f) => readFileSync(f, 'utf8').split('\n');
