import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import {
  emptyLog,
  loggedMessage,
  MAX_ENTRIES,
  mergeLog,
  refOf,
  resolveSessionId,
  statusMessage,
  withLogged,
} from '../lib/logs';
import { severityForKey } from '../lib/severity';
import type { SessionItem } from '../lib/types';
import { action, loader, validateLogsSearch } from '../routes/logs';
import { renderRoute, stubFetch } from './helpers';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '223e4567-e89b-42d3-a456-426614174000';
const sessions: SessionItem[] = [
  { id: OTHER, title: 'Newest prompt', cwd: '/x/demo', modified_at: '2026-11-01T10:00:00Z' },
  { id: ID, title: 'Older prompt' },
];
const entry = (uuid: string, text: string, over: Record<string, unknown> = {}) => ({
  uuid,
  part: 0,
  role: 'assistant',
  kind: 'text',
  at: '2026-11-01T10:00:00Z',
  text,
  ...over,
});
const body = (entries: unknown[], over: Record<string, unknown> = {}) => ({
  claude_session_id: OTHER,
  found: true,
  entries,
  next: 100,
  omitted: false,
  last_prompt_at: '2026-11-01T09:00:00Z',
  reported: [],
  ...over,
});

test('SEC-12: the logs search keeps only a Claude session id and a project key', () => {
  assert.deepEqual(validateLogsSearch({ id: ID.toUpperCase(), project: '0123456789abcdef' }), {
    id: ID,
    project: '0123456789abcdef',
  });
  assert.deepEqual(validateLogsSearch({ id: '../etc/passwd', project: 'nope' }), {});
});

test('the chosen session: a valid id wins even when unlisted, else the newest', () => {
  assert.equal(resolveSessionId(ID, sessions), ID);
  assert.equal(resolveSessionId('junk', sessions), OTHER);
  assert.equal(resolveSessionId(undefined, []), null);
});

test('mergeLog appends polled entries, keeps the cursor and caps the list', () => {
  const first = mergeLog(undefined, body([entry('u1', 'one'), entry('u2', 'two')], { omitted: true }), false);
  assert.deepEqual(
    first.entries.map((e) => e.text),
    ['one', 'two'],
  );
  assert.equal(first.next, 100);
  assert.equal(first.omitted, true);
  assert.equal(first.stick, true, 'the first read always scrolls to the bottom');

  const more = mergeLog(
    first,
    body([entry('u3', 'three')], { next: 200, reported: ['u1:0'], reported_x: 1 }),
    false,
  );
  assert.deepEqual(
    more.entries.map((e) => e.seq),
    [0, 1, 2],
  );
  assert.equal(more.next, 200);
  assert.equal(more.stick, false);
  assert.equal(more.reported['u1:0'], true);

  const many = mergeLog(
    first,
    body(Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => entry(`m${i}`, 'x'))),
    true,
  );
  assert.equal(many.entries.length, MAX_ENTRIES);
});

test('mergeLog starts over when the transcript was replaced, and ignores junk values', () => {
  const first = mergeLog(undefined, body([entry('u1', 'one')]), true);
  const replaced = mergeLog(first, body([entry('n1', 'new')], { omitted: true, next: 50 }), true);
  assert.deepEqual(
    replaced.entries.map((e) => e.text),
    ['new'],
  );
  const junk = mergeLog(
    first,
    body([null, 'x', entry('u2', 'two')], {
      severities: { 'u1:0': 'high', 'u2:0': 'bogus' },
      reasons: { 'u1:0': 5, a: 'why' },
    }),
    true,
  );
  assert.equal(junk.entries.length, 2);
  assert.deepEqual(junk.severities, { 'u1:0': 'high' });
  assert.deepEqual(junk.reasons, { a: 'why' });
  assert.equal(
    statusMessage(mergeLog(undefined, { found: false }, true)),
    'No transcript found for this session.',
  );
  assert.equal(statusMessage({ ...emptyLog(ID), found: true }), 'This session has no entries yet.');
});

test('withLogged marks one entry and keeps the first reason on file', () => {
  const state = withLogged(emptyLog(ID), 'u1:0', { severity: 'high', reason: 'bad' });
  assert.equal(state.reported['u1:0'], true);
  assert.equal(state.severities['u1:0'], 'high');
  assert.equal(state.reasons['u1:0'], 'bad');
  assert.equal(refOf({ uuid: 'u9', part: 2 }), 'u9:2');
  assert.equal(refOf({}), '');
  assert.equal(severityForKey('3'), 'high');
  assert.equal(severityForKey('7'), null);
  assert.equal(
    loggedMessage({ severity: 'low', reason: null, duplicate: false }, 'log.json'),
    'Added to log.json as Low.',
  );
  assert.match(loggedMessage({ severity: 'low', reason: null, duplicate: true }, 'log.json'), /first reason/);
});

test('FE-11: the logs loader fetches the session list, then only the chosen transcript', async () => {
  const stub = stubFetch({
    'GET /api/claude-sessions?': { sessions },
    [`GET /api/claude-sessions/${OTHER}/log`]: body([entry('u1', 'one')]),
  });
  try {
    await loader(new QueryClient(), {});
    assert.deepEqual(
      stub.calls.map((c) => c.url),
      ['/api/claude-sessions?limit=75', `/api/claude-sessions/${OTHER}/log`],
    );
  } finally {
    stub.restore();
  }
});

test('FE-11: the log action posts one entry with the severity and reason, and checks them first', async () => {
  const stub = stubFetch({
    'POST /api/claude-errors': { severity: 'high', reason: 'bad', duplicate: false },
  });
  try {
    const saved = await action({
      intent: 'log-entry',
      sessionId: ID,
      entry: entry('u1', 'boom'),
      severity: 'high',
      reason: ' bad ',
    });
    assert.deepEqual(saved, { severity: 'high', reason: 'bad', duplicate: false });
    const sent = stub.calls[0]?.body as { entry: Record<string, unknown> };
    assert.equal(sent.entry.claude_session_id, ID);
    assert.equal(sent.entry.reason, 'bad');
    assert.equal(sent.entry.severity, 'high');
    await assert.rejects(
      action({ intent: 'log-entry', sessionId: ID, entry: entry('u1', 'x'), severity: 'high', reason: ' ' }),
      /need a reason/,
    );
    await assert.rejects(
      action({ intent: 'log-entry', sessionId: 'x', entry: entry('u1', 'x'), severity: 'low', reason: null }),
      /unexpected session id/,
    );
    assert.equal(stub.calls.length, 1, 'a refused entry never reaches the server');
  } finally {
    stub.restore();
  }
});

test('the logs page renders the transcript as text, the session menu and the log dialog (SEC-4, A11Y-1)', async () => {
  const stub = stubFetch({
    'GET /api/claude-sessions?': { sessions },
    [`GET /api/claude-sessions/${OTHER}/log`]: body(
      [
        entry('u1', 'hello <img src=x onerror=alert(1)>', { role: 'user' }),
        entry('u2', 'tool out', { kind: 'tool_result' }),
      ],
      { reported: ['u1:0'], severities: { 'u1:0': 'high' }, reasons: { 'u1:0': 'bad' } },
    ),
  });
  try {
    const html = await renderRoute('/claude?project=0123456789abcdef');
    assert.match(html, /<h1[^>]*>Claude session logs<\/h1>/);
    assert.match(html, new RegExp(OTHER));
    assert.match(html, /Recent sessions/);
    assert.match(html, /Newest prompt/);
    assert.match(html, /User/);
    assert.match(html, /tool result/);
    assert.match(html, /Last prompt/);
    assert.match(html, />High</, 'a logged entry shows its severity as text');
    assert.match(html, /role="button"/);
    assert.match(html, /href="\/errors\?project=0123456789abcdef"/);
    assert.match(html, /aria-label="Log as error"/);
    assert.ok(!html.includes('<img src=x'), 'transcript text is escaped, never markup');
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  } finally {
    stub.restore();
  }
});

test('the logs page says so when there are no Claude sessions', async () => {
  const stub = stubFetch({ 'GET /api/claude-sessions?': { sessions: [] } });
  try {
    assert.match(await renderRoute('/claude'), /No Claude sessions found/);
  } finally {
    stub.restore();
  }
});
