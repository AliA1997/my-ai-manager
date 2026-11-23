import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { parseUsage } from '../lib/help';
import { loader } from '../routes/help';
import { renderRoute, stubFetch } from './helpers';

const usage = [
  'see-plan <file.html|file.md>  open the plan in the browser',
  'see-plan dashboard            open the dashboard',
  'see-plan stop',
].join('\n');

test('the CLI help is read as command and description', () => {
  assert.deepEqual(parseUsage(usage), [
    { command: 'see-plan <file.html|file.md>', about: 'open the plan in the browser' },
    { command: 'see-plan dashboard', about: 'open the dashboard' },
    { command: 'see-plan stop', about: '' },
  ]);
});

test('FE-11: the help loader asks the server once', async () => {
  const stub = stubFetch({ 'GET /api/help': { version: '4.2.0', usage } });
  try {
    await loader(new QueryClient());
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/help'],
    );
  } finally {
    stub.restore();
  }
});

test('the Help page lists every command in a table, with the version and a way to start', async () => {
  const stub = stubFetch({ 'GET /api/help': { version: '4.2.0', usage } });
  try {
    const html = await renderRoute('/help');
    assert.match(html, /<h1[^>]*>Help<\/h1>/);
    assert.ok(html.includes('see-plan dashboard') && html.includes('open the dashboard'));
    assert.ok(html.includes('4.2.0') && html.includes('npm start'));
    assert.ok(html.includes('&lt;file.html|file.md&gt;'), 'markup in a command stays text (SEC-4)');
    assert.ok(html.includes('scope="row"') && html.includes('scope="col"'));
  } finally {
    stub.restore();
  }
});
