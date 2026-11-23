import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name: string): string => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('DX-3: tsconfig keeps strict on', () => {
  const config = JSON.parse(read('tsconfig.json')) as { compilerOptions: { strict?: boolean } };
  assert.equal(config.compilerOptions.strict, true);
});

test('DX-4/DX-5: lint and format scripts exist', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  assert.match(scripts.lint ?? '', /--max-warnings 0/);
  assert.match(scripts['format:check'] ?? '', /prettier --check/);
  assert.ok(scripts.typecheck);
});
