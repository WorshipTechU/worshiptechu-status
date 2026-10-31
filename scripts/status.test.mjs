import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, serviceStates, updateHistory, dayState, overall, buildStatus, cleanIncident } from './status.mjs';
import { parseTargets } from './probe.mjs';

test('parseTargets reads service= beside expect=', () => {
  assert.deepEqual(parseTargets('https://a.example expect=200,401 service=app\nhttps://b.example service=website'), [
    { url: 'https://a.example', expect: [200, 401], service: 'app' },
    { url: 'https://b.example', expect: [200], service: 'website' },
  ]);
});

test('classify: down on error or wrong status, slow over 4 s', () => {
  assert.equal(classify({ error: 'TimeoutError' }), 'down');
  assert.equal(classify({ status: 500, ms: 10, expect: [200] }), 'down');
  assert.equal(classify({ status: 401, ms: 10, expect: [200, 401] }), 'up');
  assert.equal(classify({ status: 200, ms: 4500, expect: [200] }), 'slow');
});

test('serviceStates takes the worst probe and ignores unknown services', () => {
  const s = serviceStates([
    { service: 'app', status: 200, ms: 5, expect: [200] },
    { service: 'app', error: 'x' },
    { service: 'secret-thing', error: 'x' },
    { status: 200, ms: 1 },
  ]);
  assert.deepEqual(s, { app: 'down' });
});

test('history keeps 90 days and counts per day', () => {
  let h = { days: {} };
  const t = new Date('2026-10-31T10:00:00Z');
  h = updateHistory(h, { website: 'up' }, t);
  h = updateHistory(h, { website: 'down' }, t);
  assert.deepEqual(h.days['2026-10-31'].website, { up: 1, slow: 0, down: 1 });
  const old = { days: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`2026-01-${String(i).padStart(3, '0')}`, {}])) };
  assert.equal(Object.keys(updateHistory(old, {}, t).days).length, 90);
});

test('dayState thresholds', () => {
  assert.equal(dayState(undefined), 'none');
  assert.equal(dayState({ up: 288, slow: 0, down: 0 }), 'up');
  assert.equal(dayState({ up: 287, slow: 0, down: 1 }), 'up');
  assert.equal(dayState({ up: 280, slow: 0, down: 8 }), 'slow');
  assert.equal(dayState({ up: 100, slow: 0, down: 50 }), 'down');
});

test('overall and published JSON carry no urls', () => {
  assert.equal(overall({}), 'unknown');
  assert.equal(overall({ a: 'up', b: 'slow' }), 'slow');
  assert.equal(overall({ a: 'down', b: 'slow' }), 'down');
  const now = new Date('2026-10-31T10:00:00Z');
  const h = updateHistory({ days: {} }, { website: 'up', app: 'slow' }, now);
  const s = buildStatus(h, { website: 'up', app: 'slow' }, { title: 'x', updates: [{ at: 'a', text: 'b' }] }, now);
  assert.equal(s.overall, 'slow');
  assert.equal(s.services.length, 2);
  assert.equal(s.services[0].days.length, 90);
  assert.doesNotMatch(JSON.stringify(s), /https?:|vercel|supabase/);
});

test('cleanIncident drops an empty note', () => {
  assert.equal(cleanIncident({ title: '  ' }), null);
  assert.equal(cleanIncident(null), null);
});
