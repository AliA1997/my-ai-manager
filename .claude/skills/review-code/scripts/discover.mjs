#!/usr/bin/env node
// Lists the code files a review should cover, grouped by area, in a few lines.
// Usage: node discover.mjs [--base <ref>] [--out <file>]
// Default target: working tree vs HEAD, plus untracked files.
// Exit codes: 0 files found, 1 nothing to review, 2 usage error.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { changedLines, readLines } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--help')) {
  console.log('node discover.mjs [--base <ref>] [--out <file>]');
  process.exit(0);
}
const base = opt('--base') ?? 'HEAD';

let files;
try {
  files = changedLines(base);
} catch (e) {
  console.error(`discover: ${String(e.message).split('\n')[0]}`);
  process.exit(2);
}
if (files.size === 0) {
  console.log(`no reviewable changes vs ${base}`);
  process.exit(1);
}

const area = (f) =>
  /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./.test(f) ? 'tests'
  : /\.(css)$/.test(f) ? 'styles'
  : /\.html$/.test(f) ? 'markup'
  : /^(public)\//.test(f) ? 'frontend'
  : /\.(tsx|jsx)$/.test(f) ? 'frontend'
  : 'backend';

const rows = [...files].map(([f, set]) => ({
  f, a: area(f), n: set === null ? readLines(f).length : set.size, isNew: set === null,
}));
rows.sort((x, y) => x.a.localeCompare(y.a) || y.n - x.n);

const lines = [`${rows.length} files vs ${base} (${rows.reduce((s, r) => s + r.n, 0)} added lines)`];
for (const r of rows) lines.push(`${r.a.padEnd(8)} ${String(r.n).padStart(5)}  ${r.f}${r.isNew ? '  (new)' : ''}`);

if (opt('--out')) {
  mkdirSync(dirname(opt('--out')), { recursive: true });
  writeFileSync(opt('--out'), lines.join('\n') + '\n');
  console.log(lines.slice(0, 1).join('\n') + `\nfull list: ${opt('--out')}`);
} else {
  console.log(lines.slice(0, 41).join('\n'));
  if (lines.length > 41) console.log(`... ${lines.length - 41} more (use --out <file>)`);
}
