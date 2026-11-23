import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const tsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? tsx(join(dir, d.name)) : d.name.endsWith('.tsx') ? [join(dir, d.name)] : [],
  );

const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
const theme = new Set([...css.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]));
const CUSTOM =
  /\b(?:bg|text|border|outline|shadow)-((?:page|surface|fg|muted|line|accent|link|danger|sev)[a-z-]*)/g;

test('FE-14: every custom colour class used in src/ exists in the Tailwind theme', () => {
  const missing: string[] = [];
  for (const file of tsx(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(CUSTOM)) {
      if (m[1] && !theme.has(m[1])) missing.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(theme.size >= 10, 'the theme defines the tokens');
});

test('UX-4: styles honour prefers-reduced-motion', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('A11Y-6: dark mode swaps the colour variables', () => {
  assert.match(css, /prefers-color-scheme: dark/);
});
