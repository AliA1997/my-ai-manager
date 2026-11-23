import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { defaultDir, parseHomeMessage, sessionStatus, splitSessions, timeAgo } from '../lib/home';
import type { HomeSession, Workflow } from '../lib/types';
import { connect } from '../components/home/ConnectClaudeDialog';
import { action, loader } from '../routes/home';
import { renderRoute, stubFetch } from './helpers';

const KEY = '0123456789abcdef';
const KEY2 = 'fedcba9876543210';
const session = (over: Partial<HomeSession>): HomeSession => ({
  key: KEY,
  file: '/x/demo/plan.md',
  url: `/session/${KEY}`,
  status: 'open',
  updated_at: '2026-11-01T10:00:00Z',
  ...over,
});
const workflow: Workflow = {
  id: 'wf1',
  name: 'checkout',
  dir: '/x/demo',
  current: 'plan',
  updated_at: '2026-11-01T10:00:00Z',
  stages: { plan: { status: 'current', key: KEY }, interrogation: { status: 'locked' } },
};
const home = {
  sessions: [
    session({ workflow_id: 'wf1', stage: 'plan', agent: 'working' }),
    session({
      key: KEY2,
      url: `/session/${KEY2}`,
      file: '/y/<b>other.md',
      status: 'ended',
      ended_by: 'approved',
    }),
    session({ key: '1111111111111111', url: '/session/1111111111111111', file: '/z/loose.md' }),
  ],
  workflows: [workflow],
};

test('FE-11: the home loader fetches the sessions, features and the overview once', async () => {
  const stub = stubFetch({ 'GET /api/sessions': home });
  try {
    await loader(new QueryClient());
    assert.deepEqual(stub.calls.map((c) => c.url).sort(), [
      '/api/data/notifications?page=1&pageSize=10',
      '/api/errors?context=session&pageSize=25&page=1',
      '/api/projects?limit=50',
      '/api/sessions',
    ]);
  } finally {
    stub.restore();
  }
});

test('the dashboard shows errors, plans and the last ten notifications', async () => {
  const stub = stubFetch({
    'GET /api/sessions': home,
    'GET /api/errors?context=session': {
      items: [
        { id: 'e1', claude_session_id: 'c', uuid: 'u', part: 0, text: 'boom <b>x</b>', severity: 'high' },
      ],
      page: 1,
      pages: 1,
      total: 1,
    },
    'GET /api/projects?': { projects: [{ key: KEY, name: 'demo', root: '/x/demo', url: '/errors' }] },
    [`GET /api/projects/${KEY}/plans`]: {
      items: [{ name: '2026-11-01-ship.md', title: 'Ship it', review_key: KEY2 }],
    },
    'GET /api/data/notifications': {
      items: [
        { id: 'n1', kind: 'error', title: 'New error', message: 'High severity', at: '2026-11-01T10:00:00Z' },
      ],
      page: 1,
      pages: 1,
      total: 1,
    },
  });
  try {
    const html = await renderRoute('/');
    assert.ok(html.includes('Recent notifications') && html.includes('New error'));
    assert.ok(html.includes('Ship it') && html.includes(`/session/${KEY2}`));
    assert.ok(html.includes('boom &lt;b&gt;x&lt;/b&gt;'), 'error text is escaped (SEC-4)');
    assert.ok(
      stub.calls.some((c) => c.url.includes('pageSize=10')),
      'only ten notifications are asked for',
    );
  } finally {
    stub.restore();
  }
});

test('FE-11: the archive action posts to the session and rejects a bad key (SEC-12)', async () => {
  const stub = stubFetch({ 'POST /api/': {} });
  try {
    await action({ intent: 'archive', key: KEY });
    assert.equal(stub.calls[0]?.url, `/api/${KEY}/archive`);
    assert.deepEqual(stub.calls[0]?.body, { archived: true });
    await assert.rejects(action({ intent: 'archive', key: '../x' }), /unexpected session key/);
  } finally {
    stub.restore();
  }
});

test('FE-11: create-feature posts the feature, starts Claude when asked, and returns the page url', async () => {
  const stub = stubFetch({
    'POST /api/workflows': { key: KEY, url: `/session/${KEY}` },
    [`POST /api/${KEY}/connect-claude`]: { ok: true },
  });
  try {
    const input = { intent: 'create-feature', name: 'f', dir: '/x', requirements: 'r' } as const;
    assert.deepEqual(await action({ ...input, startClaude: true }), { url: `/session/${KEY}` });
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/workflows', `/api/${KEY}/connect-claude`],
    );
    stub.calls.length = 0;
    await action({ ...input, startClaude: false });
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/workflows'],
    );
  } finally {
    stub.restore();
  }
});

test('the home helpers: status, split, time and default folder', () => {
  assert.equal(sessionStatus({ status: 'ended', ended_by: 'approved' }), 'approved');
  assert.equal(sessionStatus({ status: 'ended' }), 'ended');
  assert.equal(sessionStatus({ status: 'feedback' }), 'notes waiting');
  const { live, done } = splitSessions(home.sessions);
  assert.equal(live.length, 2);
  assert.equal(done[0]?.key, KEY2);
  assert.equal(timeAgo('2026-11-01T10:00:00Z', Date.parse('2026-11-01T12:00:00Z')), '2 h ago');
  assert.equal(timeAgo('nope'), '');
  assert.equal(defaultDir(home), '/x/demo');
  assert.equal(defaultDir({ sessions: [session({ file: '/a/b/c.md' })], workflows: [] }), '/a/b');
});

test('SEC-12: only a well-formed sessions message replaces the page data', () => {
  assert.equal(parseHomeMessage('not json'), null);
  assert.equal(parseHomeMessage(JSON.stringify({ type: 'other', sessions: [] })), null);
  assert.equal(parseHomeMessage(JSON.stringify({ type: 'sessions', sessions: 'x' })), null);
  const ok = parseHomeMessage(JSON.stringify({ type: 'sessions', sessions: [session({})] }));
  assert.equal(ok?.sessions.length, 1);
  assert.deepEqual(ok?.workflows, []);
});

test('the dashboard renders features, both session lists and the New feature dialog; markup stays text (SEC-4)', async () => {
  const stub = stubFetch({ 'GET /api/sessions': home });
  try {
    const html = await renderRoute('/');
    assert.match(html, /<h1[^>]*>Claude Manager<\/h1>/);
    assert.match(html, /checkout/);
    assert.match(html, /Open (<!-- -->)?Plan(<!-- -->)? →/);
    assert.match(html, /1\. Plan/);
    assert.match(html, /agent working/);
    assert.match(html, /Features/);
    assert.match(html, /History/);
    assert.match(html, /Sessions/);
    assert.match(html, /Archive/);
    assert.match(html, /aria-label="New feature"/);
    assert.match(html, /Sign out/);
    assert.ok(!html.includes('<b>other'), 'a file name is escaped, not parsed as markup');
    assert.doesNotMatch(html, /Nothing finished yet/);
  } finally {
    stub.restore();
  }
});

test('the dashboard explains an empty state', async () => {
  const stub = stubFetch({ 'GET /api/sessions': { sessions: [], workflows: [] } });
  try {
    const html = await renderRoute('/');
    assert.match(html, /No features yet/);
    assert.match(html, /Nothing finished yet/);
    assert.match(html, /Nothing open/);
  } finally {
    stub.restore();
  }
});

test('the dashboard asks the person to connect Claude when no agent is connected', async () => {
  const stub = stubFetch({ 'GET /api/sessions': { sessions: [], workflows: [] } });
  try {
    const html = await renderRoute('/');
    assert.ok(html.includes('Connect your Claude agent'));
    assert.match(html, /<button[^>]*>Connect Claude<\/button>/);
    assert.ok(!html.includes('Copy message') && !html.includes('your plan file'), 'nothing to copy or type');
    assert.ok(!html.includes('Start a feature with Claude'), 'it only connects Claude');
  } finally {
    stub.restore();
  }
});

test('the connect dialog is left out once an agent is connected', async () => {
  const stub = stubFetch({ 'GET /api/sessions': home }); // the first session has an agent working
  try {
    assert.ok(!(await renderRoute('/')).includes('Connect your Claude agent'));
  } finally {
    stub.restore();
  }
});

test('the connect dialog cannot be closed, with or without earlier sessions', async () => {
  for (const sessions of [[], [session({ status: 'ended' })]]) {
    const stub = stubFetch({ 'GET /api/sessions': { sessions, workflows: [] } });
    try {
      const html = await renderRoute('/');
      assert.ok(html.includes('Connect your Claude agent') && !html.includes('Not now'));
      assert.ok(html.includes('This opens Claude Code for you.'));
    } finally {
      stub.restore();
    }
  }
});

test('one click on Connect Claude opens the welcome session, then starts Claude on it', async () => {
  const stub = stubFetch({
    'POST /api/welcome': { ok: true, key: KEY },
    [`POST /api/${KEY}/connect-claude`]: { ok: true, mode: 'powershell' },
  });
  try {
    assert.deepEqual(await connect(), { ok: true, mode: 'powershell' });
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/welcome', `/api/${KEY}/connect-claude`],
    );
  } finally {
    stub.restore();
  }
  const bad = stubFetch({ 'POST /api/welcome': { ok: true, key: '../x' } });
  try {
    await assert.rejects(connect(), /unexpected response/);
  } finally {
    bad.restore();
  }
});

test('the page links mark the current page', async () => {
  const stub = stubFetch({ 'GET /api/sessions': home });
  try {
    const html = await renderRoute('/');
    for (const name of ['Dashboard', 'Claude logs', 'Error logs', 'Notifications', 'Help'])
      assert.ok(html.includes(name), name);
    assert.match(html, /aria-current="page"[^>]*>Dashboard/);
  } finally {
    stub.restore();
  }
});

test('the dashboard shows whether Claude is connected, and unread notifications can be marked read', async () => {
  const note = { id: 'n1', kind: 'error', title: 'New error', message: 'x', at: '2026-11-01T10:00:00Z' };
  const none = stubFetch({
    'GET /api/sessions': { sessions: [], workflows: [] },
    'GET /api/data/notifications': { items: [note], page: 1, pages: 1, total: 1 },
  });
  try {
    const html = await renderRoute('/');
    assert.ok(html.includes('No Claude agent is connected.'));
    assert.ok(
      html.includes('Mark &quot;New error&quot; as read') || html.includes('Mark "New error" as read'),
    );
  } finally {
    none.restore();
  }
  const on = stubFetch({ 'GET /api/sessions': home });
  try {
    assert.ok((await renderRoute('/')).includes('Claude is connected.'));
  } finally {
    on.restore();
  }
});
