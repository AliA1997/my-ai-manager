import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryString } from '../lib/api';
import { findProject, resolveTab, tabsFor } from '../lib/errors-tabs';
import { basename, claudeHref, sessionHref } from '../lib/format';
import { isFilter, isSeverity } from '../lib/severity';
import { validateErrorsSearch } from '../routes/errors';
import { validateNotificationsSearch } from '../routes/notifications';

const project = {
  key: '0123456789abcdef',
  name: 'demo',
  root: '/x/demo',
  url: '/errors?project=0123456789abcdef',
};

test('basename handles Windows and POSIX paths', () => {
  assert.equal(basename('C:\\Users\\me\\plan.md'), 'plan.md');
  assert.equal(basename('/home/me/plan.md'), 'plan.md');
  assert.equal(basename(undefined), '');
});

test('links encode their ids', () => {
  assert.equal(sessionHref('a/b'), '/session/a%2Fb');
  assert.equal(claudeHref('x y'), '/claude?id=x%20y');
});

test('queryString skips empty values', () => {
  assert.equal(queryString({ a: 1, b: '', c: undefined, d: 'x y' }), '?a=1&d=x+y');
  assert.equal(queryString({}), '');
});

test('D13: outside a project only the Sessions tab exists; in one there are four', () => {
  assert.deepEqual(
    tabsFor(null).map((t) => t.id),
    ['sessions'],
  );
  assert.equal(tabsFor(project).length, 4);
  assert.equal(resolveTab('plans', null), 'sessions', 'a tab this mode lacks falls back to the first');
  assert.equal(resolveTab('plans', project), 'plans');
  assert.equal(resolveTab(undefined, project), 'session-errors');
});

test('findProject only matches a registered key', () => {
  assert.equal(findProject([project], project.key), project);
  assert.equal(findProject([project], 'ffffffffffffffff'), null);
  assert.equal(findProject([project], undefined), null);
});

test('severity guards', () => {
  assert.ok(isSeverity('send_to_it') && !isSeverity('unrated') && !isSeverity(3));
  assert.ok(isFilter('unrated') && !isFilter('nope'));
});

test('SEC-12: the errors page drops bad search params', () => {
  assert.deepEqual(
    validateErrorsSearch({ tab: 'plans', project: project.key, q: ' hi ', filter: 'high', page: '3' }),
    { tab: 'plans', project: project.key, q: 'hi', filter: 'high', page: 3 },
  );
  assert.deepEqual(
    validateErrorsSearch({ tab: 'x', project: '<script>', q: '  ', filter: 'x', page: '-2' }),
    {},
  );
  assert.equal(validateErrorsSearch({ q: 'a'.repeat(900) }).q?.length, 500);
});

test('SEC-12: the notifications page drops bad search params', () => {
  assert.deepEqual(validateNotificationsSearch({ filter: 'pending-download', page: 2 }), {
    filter: 'pending-download',
    page: 2,
  });
  assert.deepEqual(validateNotificationsSearch({ filter: '../x', page: 'a' }), {});
});
