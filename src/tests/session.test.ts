import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { parseAgentHtml } from '../lib/agent-html';
import {
  approveLabel,
  connectionButtons,
  connectionState,
  connectionText,
  nextStageView,
  noteCount,
  outputFrameUrl,
  parsePage,
  pruneQueue,
  toQueued,
  type Presence,
  type QueuedPrompt,
} from '../lib/session';
import { applyEvent, initialLive } from '../lib/session-live';
import { revisionBarText, uiReducer, initialUi } from '../lib/session-ui';
import { changedBlocks, snapshotFor } from '../lib/snapshot';
import { action, loader } from '../routes/session';
import { renderRoute, stubFetch } from './helpers';

const KEY = '0123456789abcdef';
const CAP = 'a'.repeat(32);
const page = {
  key: KEY,
  file: '/x/plan.md',
  status: 'open',
  ended_by: null,
  chat: [
    { role: 'agent', html: '<p>Hello <strong>there</strong> <script>x</script></p>' },
    { role: 'user', text: '<b>mine</b>', prompt_id: 'p1' },
  ],
  claude_session_id: null,
  can_resume: false,
  stage: 'plan',
  stage_source: 'text',
  has_plan: true,
  revision: 2,
  decision: null,
  poll_command: 'see-plan poll /x/plan.md --stage plan',
  history: [],
  workflow: null,
  artifact_base: `/artifact/${KEY}/${CAP}`,
  outputs: [{ id: 'main', file: '/x/plan.md', kind: 'md', revision: 2 }],
};
const idle: Presence = {
  listening: false,
  working: false,
  agent: null,
  session_id: null,
  last_poll_at: null,
};
const base = { workflow: null, baseUrl: 'http://127.0.0.1:1' };

test('FE-11: the session loader fetches the page data once and starts the status read', async () => {
  const stub = stubFetch({ [`GET /api/${KEY}/page`]: page, 'GET /api/claude-status': { launch: 'on' } });
  try {
    await loader(new QueryClient(), KEY);
    assert.equal(stub.calls[0]?.url, `/api/${KEY}/page`);
  } finally {
    stub.restore();
  }
});

test('SEC-12: the page data is checked, and a bad key is refused', () => {
  assert.equal(parsePage(page).stage, 'plan');
  assert.deepEqual(parsePage({ ...page, outputs: [] }).outputs, [
    { id: 'main', file: '', kind: 'html', revision: 2 },
  ]);
  assert.throws(() => parsePage({ ...page, key: '../x' }));
});

test('FE-11: the send action posts the notes with the snapshot and reads the chat back', async () => {
  const stub = stubFetch({
    [`POST /api/${KEY}/prompts`]: {
      chat: [{ role: 'user', prompt_id: 'p1' }],
      delivered: 'queued-for-agent',
    },
  });
  try {
    const note = toQueued({ prompt: ' hi ', tag: 'chat' });
    assert.ok(note);
    const res = await action({ intent: 'send', key: KEY, prompts: [note], domSnapshot: '<p>', end: true });
    assert.deepEqual(stub.calls[0]?.body, { prompts: [note], dom_snapshot: '<p>', end: true });
    assert.equal(res.delivered, 'queued-for-agent');
    await assert.rejects(action({ intent: 'end', key: '../etc' }));
  } finally {
    stub.restore();
  }
});

test('FE-11: stage, revision and attach actions validate their input', async () => {
  const stub = stubFetch({
    [`POST /api/${KEY}/stage`]: { stage: 'plan', stage_source: 'human' },
    [`GET /api/${KEY}/revisions?output=o1`]: {
      revisions: [
        { n: 1, at: 'a' },
        { n: 2, at: 'b' },
      ],
    },
  });
  try {
    assert.deepEqual(await action({ intent: 'stage', key: KEY, stage: 'plan' }), {
      stage: 'plan',
      stageSource: 'human',
    });
    const list = await action({ intent: 'revisions', key: KEY, output: 'o1' });
    assert.deepEqual(
      list.revisions?.map((r) => r.n),
      [2, 1],
      'newest first',
    );
    await assert.rejects(action({ intent: 'attach-claude', key: KEY, id: 'nope' }));
    await assert.rejects(action({ intent: 'revision', key: KEY, output: 'main', n: -1 }));
  } finally {
    stub.restore();
  }
});

test('the unsent notes: pruned once the server holds them, counted per output', () => {
  const q: QueuedPrompt[] = [
    { prompt_id: 'a', prompt: 'x', tag: 'div', selector: '', text: '', output: 'o1' },
    { prompt_id: 'b', prompt: 'y', tag: 'chat', selector: '', text: '' },
  ];
  assert.deepEqual(
    pruneQueue(q, [{ prompt_id: 'a' }]).map((p) => p.prompt_id),
    ['b'],
  );
  assert.equal(noteCount(q, 'o1'), 1);
  assert.equal(noteCount(q, 'main'), 0, 'chat notes belong to no output');
  assert.equal(toQueued({ prompt: '  ' }), null);
});

test('the artifact frame URL keeps its capability and an output path', () => {
  assert.equal(
    outputFrameUrl(`/artifact/${KEY}/${CAP}`, 'main', 3),
    `/artifact/${KEY}/${CAP}/index.html?rev=3`,
  );
  assert.equal(outputFrameUrl('/a/b', 'x y', 1), '/a/b/o/x%20y/index.html?rev=1');
});

test('the connection card moves through its states', () => {
  const launch = {
    at: 1000,
    mode: 'powershell',
    command: '',
    strategy: 'powershell',
    reasons: [],
    tmux_window: '',
  };
  assert.equal(connectionState(idle, null, null, 0), 'idle');
  assert.equal(connectionState(idle, launch, null, 2000), 'starting');
  assert.equal(connectionState(idle, launch, null, 1000 + 45_000), 'stuck');
  assert.equal(connectionState({ ...idle, listening: true }, launch, null, 2000), 'connected');
  assert.equal(connectionState(idle, null, { launch: 'off' }, 0), 'off');
  assert.equal(connectionState(idle, null, { launch: 'on', claude_found: false }, 0), 'unsupported');
  assert.match(connectionText('starting', idle, launch, null, 6000), /Starting Claude… 0:05/);
  const buttons = connectionButtons('idle', null, null, true, false);
  assert.deepEqual([buttons.connect, buttons.resume, buttons.manual], [true, true, true]);
  assert.equal(connectionButtons('connected', null, null, true, true).viewLog, true);
});

test('stages: the approve label and the next-stage message', () => {
  assert.equal(approveLabel('verification'), 'Accept');
  assert.equal(approveLabel(null), 'Approve plan');
  assert.deepEqual(nextStageView({ from: 'plan', next: 'interrogation' }), {
    text: 'Plan approved. Interrogation is ready.',
    go: 'Start Interrogation →',
  });
  assert.equal(nextStageView({ next: null }).go, null);
});

test('live events fold into the state and ignore what they do not know', () => {
  let s = applyEvent(
    initialLive,
    { type: 'presence', listening: true, agent: 'claude', session_id: 's' },
    base,
  );
  assert.equal(s.presence.listening, true);
  s = applyEvent(s, { type: 'reload', output: 'o1', revision: 4 }, base);
  s = applyEvent(s, { type: 'revision', revision: 5 }, base);
  assert.deepEqual([s.revisions, s.reloads], [{ o1: 4, main: 5 }, { o1: 1 }]);
  s = applyEvent(s, { type: 'ended', ended_by: 'approved' }, base);
  assert.deepEqual(s.ended, { by: 'approved' });
  assert.equal(applyEvent(s, { type: 'nonsense' }, base), s);
  assert.equal(applyEvent(s, 'text', base), s);
  const wf = parsePage({
    ...page,
    workflow: { id: 'w', name: 'n', current: 'plan', stages: { plan: { status: 'current', key: KEY } } },
  }).workflow;
  const ready = applyEvent(
    initialLive,
    { type: 'stage-ready', next: 'interrogation', next_url: '/session/x', from: 'plan' },
    { ...base, workflow: wf },
  );
  assert.equal(ready.workflow?.current, 'interrogation');
  assert.equal(ready.nextStage?.next, 'interrogation');
});

test('the review reducer keeps the revision and the output apart', () => {
  let ui = initialUi([], true);
  ui = uiReducer(ui, { type: 'viewing', viewing: { n: 1, html: '<p>', latest: 3 } });
  const viewing = { n: 1, html: '<p>', latest: 3 };
  assert.match(revisionBarText(viewing, 3), /^Viewing revision r1 \(read-only\)\.$/);
  assert.match(revisionBarText(viewing, 4), /newer revision r4/);
  ui = uiReducer(ui, { type: 'output', id: 'o1', revision: 2, annotate: false });
  assert.deepEqual([ui.currentOutput, ui.viewing, ui.annotate, ui.seen], ['o1', null, false, { o1: 2 }]);
});

test('SEC-4: agent text is read into whitelisted nodes; scripts and bad links are dropped', () => {
  const nodes = parseAgentHtml(
    '<p>a &lt;b&gt; <a href="javascript:x">l</a> <a href="https://e.com/?a=1&amp;b=2">m</a><script>x</script></p>',
  );
  const json = JSON.stringify(nodes);
  assert.ok(json.includes('a <b> '), 'entities are decoded into text, not markup');
  assert.ok(!json.includes('javascript:') && !json.includes('script'));
  assert.ok(json.includes('https://e.com/?a=1&b=2'));
});

test('snapshots: changed blocks are outlined, and notes name their own output', () => {
  assert.deepEqual(changedBlocks('<body></body>', '<body></body>'), []);
  assert.equal(snapshotFor(1, [], {}, 'now'), 'now');
  const batch: QueuedPrompt[] = [
    { prompt_id: 'a', prompt: 'x', tag: 'div', selector: '', text: '', output: 'o1' },
  ];
  assert.equal(
    snapshotFor(2, batch, { o1: '<p>1</p>', o2: '<p>2</p>' }, ''),
    '<!-- see-plan output: o1 -->\n<p>1</p>',
  );
});

test('FE-11: /session/:key renders the review from its loader, with the sandboxed frame', async () => {
  const stub = stubFetch({
    [`GET /api/${KEY}/page`]: page,
    'GET /api/claude-status': { launch: 'on' },
  });
  try {
    const html = await renderRoute(`/session/${KEY}`);
    assert.ok(html.includes('sandbox="allow-scripts allow-forms allow-popups"'));
    assert.ok(!html.includes('allow-same-origin'));
    assert.ok(html.includes(`src="/artifact/${KEY}/${CAP}/index.html?rev=2"`));
    assert.ok(html.includes('Send to Agent') && html.includes('Approve plan') && html.includes('More'));
    assert.ok(
      html.includes('<strong>there</strong>') && !html.includes('<script>'),
      'agent text is drawn, scripts dropped',
    );
    assert.ok(html.includes('&lt;b&gt;mine&lt;/b&gt;'), "the person's text is escaped");
    assert.ok(html.includes('(inferred)'), 'a label read from the text asks for confirmation');
    assert.ok(html.includes('No agent connected.') && html.includes('Connect Claude'));
    assert.ok(html.includes('role="tablist"') && html.includes('aria-controls="claude-log-panel"'));
    assert.ok(html.indexOf('aria-label="Message the agent"') > html.indexOf('aria-label="Review panel"'));
  } finally {
    stub.restore();
  }
});

test('the session route refuses a malformed key', async () => {
  const stub = stubFetch({});
  try {
    const html = await renderRoute('/session/not-a-key');
    assert.ok(!html.includes('<iframe'));
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});
