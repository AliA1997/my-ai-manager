import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { action as errorsAction, loader as errorsLoader } from '../routes/errors';
import { action as notificationsAction, loader as notificationsLoader } from '../routes/notifications';
import { renderRoute, stubFetch } from './helpers';

const KEY = '0123456789abcdef';
const project = { key: KEY, name: 'demo', root: '/x/demo', url: `/errors?project=${KEY}` };
const error = {
  claude_session_id: 'sess-1',
  uuid: 'u1',
  part: 0,
  role: 'assistant',
  text: 'boom <b>not markup</b>',
  severity: null,
  claude_title: 'Fix it',
  reported_at: '2026-11-01T10:00:00Z',
};
const page = (items: unknown[]) => ({ items, page: 1, pages: 1, total: items.length });

const errorRoutes = {
  'GET /api/projects': { projects: [project] },
  'GET /api/errors/summary': { counts: { session: { all: 1, high: 1 }, plan: { all: 0 } }, plans: 2 },
  'GET /api/errors?': page([error]),
  'GET /api/projects/': {
    items: [{ name: '2026-11-01-a.md', created_at: '2026-11-01', status: 'Open' }],
    total: 1,
  },
  'GET /api/claude-sessions': { sessions: [{ id: 'abcdef12-0000', title: 'A session', cwd: '/x/demo' }] },
};

test('FE-11: the errors loader fetches the project list, counts and the active tab', async () => {
  const stub = stubFetch(errorRoutes);
  try {
    const queryClient = new QueryClient();
    await errorsLoader(queryClient, { project: KEY, filter: 'high', q: 'boom', page: 2 });
    const urls = stub.calls.map((c) => c.url);
    assert.ok(urls.includes('/api/projects?limit=50'));
    assert.ok(urls.includes(`/api/errors/summary?project=${KEY}`));
    assert.ok(
      urls.some(
        (u) =>
          u.startsWith('/api/errors?context=session') &&
          u.includes('severity=high') &&
          u.includes('page=2') &&
          u.includes('q=boom'),
      ),
    );
  } finally {
    stub.restore();
  }
});

test('FE-11: outside a project the errors loader loads only sessions', async () => {
  const stub = stubFetch(errorRoutes);
  try {
    await errorsLoader(new QueryClient(), {});
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/projects?limit=50', '/api/claude-sessions?limit=75'],
    );
  } finally {
    stub.restore();
  }
});

test('FE-11: the errors action rates once, and refuses an unexpected open-plan reply', async () => {
  const stub = stubFetch({
    'POST /api/errors/rate': { ok: true },
    'POST /api/projects/': (call: { url: string }) =>
      call.url.includes('good') ? { key: KEY } : { key: '../x' },
  });
  try {
    await errorsAction({
      intent: 'rate',
      claude_session_id: 's',
      uuid: 'u',
      part: 0,
      severity: 'high',
      reason: 'because',
    });
    assert.deepEqual(stub.calls[0]?.body, {
      claude_session_id: 's',
      uuid: 'u',
      part: 0,
      severity: 'high',
      reason: 'because',
    });
    assert.deepEqual(await errorsAction({ intent: 'open-plan', project: 'good', name: 'a.md' }), {
      key: KEY,
    });
    await assert.rejects(
      errorsAction({ intent: 'open-plan', project: 'bad', name: 'a.md' }),
      /unexpected response/,
    );
  } finally {
    stub.restore();
  }
});

test('FE-11: the notifications loader and action', async () => {
  const stub = stubFetch({
    'GET /api/data/notifications': page([]),
    'GET /api/data/config': { config: { deletionRule: { type: 'notify-only', threshold: 10 } }, dir: '/d' },
    'POST /api/notifications/read': { ok: true },
    'PUT /api/data/config': { config: {} },
  });
  try {
    await notificationsLoader(new QueryClient(), { filter: 'error', page: 2 });
    assert.ok(stub.calls.some((c) => c.url === '/api/data/notifications?page=2&pageSize=25&filter=error'));
    await notificationsAction({ intent: 'mark-read', id: 'n1' });
    await notificationsAction({ intent: 'save-settings', rule: { type: 'notify-only', threshold: 5 } });
    assert.deepEqual(stub.calls.at(-2)?.body, { id: 'n1' });
    assert.deepEqual(stub.calls.at(-1)?.body, { deletionRule: { type: 'notify-only', threshold: 5 } });
  } finally {
    stub.restore();
  }
});

test('errors page: four ARIA tabs in a project, the error text is escaped, one h1 (D10, SEC-4, A11Y-9)', async () => {
  const stub = stubFetch(errorRoutes);
  try {
    const html = await renderRoute(`/errors?project=${KEY}`);
    assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
    for (const id of ['session-errors', 'plan-errors', 'plans', 'sessions'])
      assert.ok(html.includes(`aria-controls="panel-${id}"`), id);
    assert.ok(html.includes('aria-selected="true"') && html.includes('Error logs'));
    assert.ok(html.includes('boom &lt;b&gt;not markup&lt;/b&gt;'), 'text is escaped, never markup');
    assert.ok(!html.includes('<b>not markup</b>'));
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.ok(html.includes('role="search"') && html.includes('Rate…'));
  } finally {
    stub.restore();
  }
});

test('errors page: only Sessions outside a project, with recent projects linked; an unknown project is explained (D13)', async () => {
  const stub = stubFetch(errorRoutes);
  try {
    const none = await renderRoute('/errors');
    assert.equal((none.match(/role="tab"/g) ?? []).length, 1);
    assert.ok(
      none.includes('Recent sessions') &&
        none.includes(`href="/errors?project=${KEY}"`) &&
        none.includes('A session'),
    );
    assert.ok(!none.includes('panel-plan-errors'));
    const unknown = await renderRoute('/errors?project=ffffffffffffffff');
    assert.ok(unknown.includes('isn&#x27;t registered') || unknown.includes("isn't registered"));
    assert.equal((unknown.match(/role="tab"/g) ?? []).length, 1);
  } finally {
    stub.restore();
  }
});

test('notifications page: list, filter, unread button, download link and settings form', async () => {
  const stub = stubFetch({
    'GET /api/data/notifications': {
      ...page([
        { id: 'n1', kind: 'error', title: 'New error', message: 'm <i>x</i>', read: false },
        { id: 'n2', kind: 'pending-download', title: 'Waiting', message: 'dl', domain: 'errors', read: true },
      ]),
      counts: { error: 1 },
    },
    'GET /api/data/config': {
      config: { deletionRule: { type: 'delete-oldest', threshold: 100, deleteCount: 5 } },
      dir: '/data',
    },
  });
  try {
    const html = await renderRoute('/notifications');
    assert.ok(html.includes('Notification list') && html.includes('role="search"'));
    assert.equal((html.match(/Mark as read/g) ?? []).length, 1, 'only unread rows offer it');
    assert.ok(html.includes('href="/api/data/errors/export"'));
    assert.ok(html.includes('m &lt;i&gt;x&lt;/i&gt;'));
    assert.ok(html.includes('Delete this many at a time'), 'delete-oldest shows its count field');
    assert.ok(html.includes('value="100"') && html.includes('/data'));
    assert.ok(html.includes('Error (1)') || html.includes('New error (1)'), 'counts show in the select');
  } finally {
    stub.restore();
  }
});
