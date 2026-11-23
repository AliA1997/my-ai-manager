#!/usr/bin/env node
// Runs the yes/no questions in jev-questions.json over files with `jev ask -q`,
// so judgment-style rules are checked without reading the files into context.
// Usage: node jev-sweep.mjs [--ids SEC-1,SEC-3] [--out <file>] <file|dir>...
// Exit codes: 0 no file answered yes, 1 some did, 2 usage error or jev missing.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const paths = args.filter((a, i) => !a.startsWith('--') && !['--ids', '--out'].includes(args[i - 1]));
if (!paths.length) { console.error('usage: jev-sweep.mjs [--ids A,B] [--out f] <file|dir>...'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
let questions = JSON.parse(readFileSync(join(here, 'jev-questions.json'), 'utf8'));
if (opt('--ids')) { const want = new Set(opt('--ids').split(',')); questions = questions.filter((q) => want.has(q.id)); }

try { execFileSync('jev', ['--version'], { stdio: 'ignore' }); }
catch { console.error('jev is not installed; fall back to reading the flagged areas by hand'); process.exit(2); }

const lines = [];
for (const { id, q } of questions) {
  let out = '';
  try { out = execFileSync('jev', ['ask', q, ...paths, '-q'], { encoding: 'utf8', timeout: 120000 }).trim(); }
  catch (e) { out = `ERROR ${String(e.message).split('\n')[0]}`; }
  if (out && !/^no file/i.test(out)) out.split('\n').forEach((l) => lines.push(`${id.padEnd(7)} ${l.trim()}`));
}
const head = `jev-sweep: ${lines.length} yes-answers across ${questions.length} questions (scores >=0.9 act on, 0.6-0.9 verify the cited line)`;
if (opt('--out')) { mkdirSync(dirname(opt('--out')), { recursive: true }); writeFileSync(opt('--out'), [head, ...lines].join('\n') + '\n'); console.log(`${head}\nfull list: ${opt('--out')}`); }
else { console.log(head); lines.slice(0, 40).forEach((l) => console.log(l)); }
process.exit(lines.length ? 1 : 0);
