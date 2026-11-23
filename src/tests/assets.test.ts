import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUBLIC_ASSETS } from '../assets.js';
import { createAppHtml, APP_ROUTES } from '../app-shell.js';

test('FE-1: the shell has one #root, the stylesheet and the module bundle, and escapes its inputs', () => {
  const html = createAppHtml({ baseUrl: 'http://x"><script>', title: '<b>t</b>' });
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(html.includes('<script type="module" src="/app/main.js">'));
  assert.ok(html.includes('href="/app/app.css"'));
  assert.ok(!html.includes('<script>') && !html.includes('<b>t</b>'));
  assert.deepEqual(APP_ROUTES, ['/', '/claude', '/errors', '/notifications', '/session/$key', '/help']);
});

test('build: when the app is built, every file in its manifest is a public asset (SEA embeds exactly these)', () => {
  const manifest = new URL('../../public/app/manifest.json', import.meta.url);
  if (!existsSync(manifest)) return; // not built in this checkout; `npm run build:app` creates it
  const { files } = JSON.parse(readFileSync(manifest, 'utf8')) as { files: string[] };
  assert.ok(files.includes('app/main.js') && files.includes('app/app.css'));
  for (const file of files) assert.ok(PUBLIC_ASSETS.includes(file), file);
  assert.ok(PUBLIC_ASSETS.includes('app/manifest.json'));
});
