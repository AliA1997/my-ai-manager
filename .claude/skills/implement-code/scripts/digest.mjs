#!/usr/bin/env node
// Prints only the STANDARDS.md rules you ask for, so the whole file is never loaded.
// Usage: node digest.mjs FE SEC          (all rules with those prefixes)
//        node digest.mjs --ids FE-10,SEC-4
//        node digest.mjs --list          (prefixes and rule counts)
// Prefixes: FE BE SEC PERF UX A11Y DX
// Exit codes: 0 ok, 1 nothing matched, 2 usage error.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const std = join(here, '../../../../docs/conventions/STANDARDS.md');
let text;
try {
  text = readFileSync(std, 'utf8');
} catch {
  console.error(`digest: cannot read ${std}`);
  process.exit(2);
}

const rules = [];
for (const line of text.split('\n')) {
  const m = /\*\*([A-Z0-9]+-\d+)\*\*/.exec(line);
  if (!m) continue;
  const body = line
    .replace(/^[-|\s]*/, '')
    .replace(/\*\*/g, '')
    .replace(/\|/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^([A-Z0-9]+-\d+) - /, '$1 ')
    .trim();
  rules.push({ id: m[1], body });
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: digest.mjs <PREFIX...> | --ids A,B | --list');
  process.exit(2);
}
if (args[0] === '--list') {
  const counts = {};
  for (const r of rules) {
    const p = r.id.split('-')[0];
    counts[p] = (counts[p] ?? 0) + 1;
  }
  console.log(Object.entries(counts).map(([p, n]) => `${p}:${n}`).join(' '));
  process.exit(0);
}
const wanted = args[0] === '--ids' ? new Set(args[1]?.split(',')) : null;
const prefixes = wanted ? null : new Set(args.map((a) => a.toUpperCase()));
const hits = rules.filter((r) => (wanted ? wanted.has(r.id) : prefixes.has(r.id.split('-')[0])));
hits.forEach((r) => console.log(r.body.length > 220 ? r.body.slice(0, 217) + '...' : r.body));
process.exit(hits.length ? 0 : 1);
