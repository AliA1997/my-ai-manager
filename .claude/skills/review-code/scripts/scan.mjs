#!/usr/bin/env node
// Regex pass over code for the mechanical rules in rules.json (each cites a STANDARDS.md ID).
// Usage: node scan.mjs [--base <ref>] [--all] [--max <n>] [--out <file>] [files...]
//   no files  -> files from git changes vs --base (default HEAD)
//   default   -> only ADDED lines are checked, so old violations do not bury the change
//   --all     -> check every line of the files
// Exit codes: 0 clean, 1 findings, 2 usage error.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedLines, readLines, SKIP, CODE } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flagValues = new Set(['--base', '--max', '--out']);
const files = args.filter((a, i) => !a.startsWith('--') && !flagValues.has(args[i - 1]));
const all = args.includes('--all');
const max = Number(opt('--max', 40));

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')).map((r) => ({
  ...r, re: new RegExp(r.pattern, r.flags ?? ''),
}));

let targets;
try {
  if (files.length) targets = new Map(files.filter((f) => !SKIP.test(f) && CODE.test(f)).map((f) => [f, null]));
  else targets = changedLines(opt('--base', 'HEAD'));
} catch (e) {
  console.error(`scan: ${String(e.message).split('\n')[0]}`);
  process.exit(2);
}

const findings = [];
for (const [file, added] of targets) {
  const ext = extname(file).slice(1);
  let lines;
  try { lines = readLines(file); } catch { continue; }
  lines.forEach((text, i) => {
    const n = i + 1;
    if (!all && added && !added.has(n)) return;
    for (const r of rules) {
      if (r.exts.includes(ext) && r.re.test(text)) {
        findings.push({ id: r.id, sev: r.sev, file, n, msg: r.message, text: text.trim().slice(0, 90) });
      }
    }
  });
}

const rank = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => rank[a.sev] - rank[b.sev] || a.file.localeCompare(b.file) || a.n - b.n);
const fmt = (f) => `${f.sev.padEnd(6)} ${f.id.padEnd(7)} ${f.file}:${f.n}  ${f.msg} | ${f.text}`;
const head = `scan: ${findings.length} findings in ${new Set(findings.map((f) => f.file)).size} of ${targets.size} files (${all ? 'all lines' : 'added lines'})`;

if (opt('--out')) {
  mkdirSync(dirname(opt('--out')), { recursive: true });
  writeFileSync(opt('--out'), [head, ...findings.map(fmt)].join('\n') + '\n');
  console.log(`${head}\nfull list: ${opt('--out')}`);
} else {
  console.log(head);
  findings.slice(0, max).forEach((f) => console.log(fmt(f)));
  if (findings.length > max) console.log(`... ${findings.length - max} more (use --out <file>)`);
}
process.exit(findings.length ? 1 : 0);
