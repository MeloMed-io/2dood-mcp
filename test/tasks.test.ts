import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInserts, resolveDue } from '../src/tasks.ts';

const now = new Date(2026, 10, 5, 14, 0); // Thu Nov 5 2026, 2pm local

test('paste-to-many splits lines and pulls dates out of titles', () => {
  const rows = planInserts('u1', { text: '- [ ] WEBASSIGN friday\n2. reply to roderick\n• essay nov 12 5pm' }, now);
  assert.deepEqual(rows.map((r) => r.title), ['WEBASSIGN', 'reply to roderick', 'essay']);
  const fri = new Date(rows[0].due_at!);
  assert.equal(fri.getDay(), 5);
  assert.equal(fri.getHours(), 9);
  assert.equal(rows[1].due_at, null);
  const essay = new Date(rows[2].due_at!);
  assert.equal(essay.getDate(), 12);
  assert.equal(essay.getHours(), 17);
});

test('shared due overrides title dates; parse_dates=false keeps titles intact', () => {
  const shared = planInserts('u1', { text: 'a monday; b', due: 'tomorrow', priority: 'high' }, now);
  assert.equal(shared[0].title, 'a monday');
  assert.equal(new Date(shared[0].due_at!).getDate(), 6);
  assert.equal(shared[1].priority, 2);
  const raw = planInserts('u1', { text: 'read ch 3 friday', parseDates: false }, now);
  assert.equal(raw[0].title, 'read ch 3 friday');
  assert.equal(raw[0].due_at, null);
});

test('resolveDue handles ISO, plain dates, clearing, and rejects junk', () => {
  assert.equal(resolveDue('none', now), null);
  assert.equal(resolveDue('', now), null);
  assert.equal(new Date(resolveDue('2026-12-01', now)!).getHours(), 9);
  assert.equal(resolveDue('2026-12-01T15:00:00Z', now), '2026-12-01T15:00:00.000Z');
  assert.throws(() => resolveDue('banana', now), /Couldn't read/);
});
