#!/usr/bin/env node
// Creates a file from a boilerplate in ../assets. Never overwrites.
// Usage: node scaffold.mjs <kind> <Name> [--feature <feature>] [--dry]
// Kinds: route component skeleton test helper
// Exit codes: 0 created (or dry run), 1 target exists, 2 usage error.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [kind, rawName] = args;
const feature = args.includes('--feature') ? args[args.indexOf('--feature') + 1] : 'shared';
const dry = args.includes('--dry');

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
const pascal = (s) =>
  kebab(s).split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

const KINDS = {
  route: (n) => ({ tpl: 'route.tsx.tmpl', out: `src/routes/${kebab(n)}.tsx` }),
  component: (n, f) => ({ tpl: 'component.tsx.tmpl', out: `src/components/${kebab(f)}/${pascal(n)}.tsx` }),
  skeleton: (n, f) => ({ tpl: 'skeleton.tsx.tmpl', out: `src/components/${kebab(f)}/${pascal(n)}Skeleton.tsx` }),
  test: (n) => ({ tpl: 'test.tsx.tmpl', out: `src/tests/${pascal(n)}.test.tsx` }),
  helper: (n) => ({ tpl: 'helper.ts.tmpl', out: `helpers/${kebab(n)}.ts` }),
};

const ident = /^[A-Za-z][\w-]*$/;
if (!KINDS[kind] || !rawName || !ident.test(rawName) || !ident.test(feature)) {
  console.error(`usage: scaffold.mjs <${Object.keys(KINDS).join('|')}> <Name> [--feature <feature>] [--dry]`);
  process.exit(2);
}
const { tpl, out } = KINDS[kind](rawName, feature);
if (existsSync(out)) {
  console.error(`exists, not overwritten: ${out}`);
  process.exit(1);
}

const body = readFileSync(join(here, '../assets', tpl), 'utf8')
  .replaceAll('{{Name}}', pascal(rawName))
  .replaceAll('{{name}}', kebab(rawName))
  .replaceAll('{{feature}}', kebab(feature));

if (!dry) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
}
console.log(`${dry ? 'would create' : 'created'}: ${out}`);
