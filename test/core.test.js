import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, components, plainText, safeUrl, toIso, worstStatus } from '../src/normalize.js';
import { DAY, historyWindow, internetDays, providerDays, quietTime, startedWithin } from '../src/history.js';
import { headline } from '../src/summary.js';
import { Monitor } from '../src/monitor.js';
import { PROVIDERS } from '../src/providers.js';
import { ADAPTERS } from '../src/adapters/index.js';
import { renderDetail, renderHome } from '../src/render.js';
import { buildSummary } from '../src/summary.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const at = (daysAgo, hour = 0) => new Date(NOW - daysAgo * DAY + hour * 3_600_000).toISOString();
const inc = (id, impact, startedAt, resolvedAt = null) => ({ id, name: id, impact, status: '', startedAt, resolvedAt, updatedAt: null, url: null, updates: [] });
const state = (over = {}) => ({ provider: { slug: 'x', name: 'X', category: 'dev', page: 'https://status.x.test' }, status: 'operational', description: '', incidents: [], components: [], componentCount: 0, componentIssues: 0, history: [], coverageStart: null, okAt: NOW, ...over });

test('plainText strips markup and decodes entities', () => {
  assert.equal(plainText('<p>We&#39;re <b>on</b> it&nbsp;now</p><p>Second &amp; last</p>'), "We're on it now\nSecond & last");
  assert.equal(plainText('<script>alert(1)</script>ok'), 'alert(1)ok');
  assert.equal(plainText(null), '');
});

test('small helpers', () => {
  assert.equal(worstStatus(['operational', 'maintenance']), 'maintenance');
  assert.equal(worstStatus(['maintenance', 'degraded', 'partial_outage']), 'partial_outage');
  assert.equal(worstStatus([]), 'operational');
  assert.equal(toIso(1794746282), new Date(1794746282000).toISOString(), 'epoch seconds');
  assert.equal(toIso('1794746282000'), new Date(1794746282000).toISOString(), 'epoch milliseconds');
  assert.equal(toIso('nonsense'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://stspg.io/abc'), 'https://stspg.io/abc');
  assert.equal(clip('abcdef', 4), 'abc…');
});

test('long component lists are reduced to the ones with issues', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ name: `Region ${i}`, status: i === 7 ? 'degraded' : 'operational' }));
  const out = components(many);
  assert.equal(out.componentCount, 200);
  assert.equal(out.componentIssues, 1);
  assert.deepEqual(out.components.map((c) => c.name), ['Region 7']);
  assert.equal(components(many.slice(0, 10)).components.length, 10);
});

test('providerDays paints each day an incident touched and marks days without data', () => {
  const win = historyWindow(NOW, 90);
  assert.equal(win.end - win.start, 90 * DAY);

  const none = providerDays(state({ history: null }), win, NOW);
  assert.ok(none.levels.every((l) => l === -1));

  const s = state({
    coverageStart: at(30),
    history: [inc('a', 'minor', at(10), at(10, 2)), inc('b', 'critical', at(5), at(3)), inc('n', 'none', at(1), at(1, 1)), inc('old', 'major', at(60), at(59))],
    incidents: [inc('live', 'major', at(0, -1))],
  });
  const { levels, counts } = providerDays(s, win, NOW);
  assert.equal(levels[89 - 40], -1, 'before coverage');
  assert.equal(levels[89 - 60], -1, 'incidents before coverage are not painted');
  assert.equal(levels[89 - 20], 0);
  assert.equal(levels[89 - 10], 1);
  assert.deepEqual([levels[89 - 5], levels[89 - 4], levels[89 - 3]], [3, 3, 3]);
  assert.equal(levels[89 - 1], 0, 'no-impact notices do not count');
  assert.equal(levels[89], 2, 'active incidents count for today');
  assert.equal(counts[89], 1);
});

test('internetDays counts affected services per day', () => {
  const win = historyWindow(NOW, 3);
  const days = internetDays(
    [
      { levels: [0, 1, 0], counts: [0, 2, 0] },
      { levels: [-1, 3, 0], counts: [0, 1, 0] },
    ],
    win,
  );
  assert.deepEqual(days.affected, [0, 2, 0]);
  assert.deepEqual(days.incidents, [0, 3, 0]);
  assert.deepEqual(days.covered, [1, 2, 2]);
  assert.deepEqual(days.levels, [0, 3, 0]);
});

test('quietTime measures the time with no open incident anywhere', () => {
  const win = { start: NOW - 10 * DAY, end: NOW, days: 10 };
  const a = state({ history: [inc('a', 'minor', at(10), at(6))] });
  const b = state({ history: [inc('b', 'major', at(7), at(4))], incidents: [inc('c', 'minor', at(1))] });
  const q = quietTime([a, b], win, NOW);
  assert.ok(Math.abs(q.fraction - 0.3) < 1e-9, `fraction ${q.fraction}`);
  assert.equal(q.longestMs, 3 * DAY);
  assert.equal(quietTime([state()], win, NOW).fraction, 1);
  assert.equal(startedWithin([a, b], NOW, 2 * DAY), 1);
});

test('headline follows how much of the internet is up', () => {
  const counts = (over) => ({ operational: 0, degraded: 0, partial_outage: 0, major_outage: 0, maintenance: 0, unknown: 0, pending: 0, ...over });
  assert.equal(headline(counts({ operational: 100 }), 100, []).title, 'All Systems Operational');
  assert.deepEqual(headline(counts({ operational: 90, degraded: 10 }), 100, []), { level: 'warn', title: 'Some Systems Operational' });
  assert.equal(headline(counts({ operational: 70, degraded: 30 }), 100, []).level, 'bad');
  assert.equal(headline(counts({ operational: 99, major_outage: 1 }), 100, ['AWS']).level, 'bad');
  assert.equal(headline(counts({ operational: 30, degraded: 70 }), 100, []).title, 'Few Systems Operational');
  assert.equal(headline(counts({ degraded: 100 }), 100, []).title, 'No Systems Operational');
  assert.equal(headline(counts({ pending: 100 }), 100, []).level, 'pending');
});

test('catalog: unique slugs, known adapters, https sources', () => {
  const slugs = new Set();
  for (const p of PROVIDERS) {
    assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
    assert.match(p.slug, /^[a-z0-9-]+$/);
    assert.ok(ADAPTERS[p.type], `${p.slug}: unknown adapter ${p.type}`);
    assert.ok(p.page.startsWith('https://'), p.slug);
  }
  assert.ok(!slugs.has('api') && !slugs.has('assets') && !slugs.has('health'));
});

test('monitor keeps the last status through a blip and gives up after repeated failures', async () => {
  const provider = { slug: 'x', name: 'X', category: 'dev', type: 'statuspage', base: 'https://x.test', page: 'https://x.test' };
  let fail = false;
  const ctx = {
    now: () => NOW,
    getJson: async (url) => {
      if (fail) throw new Error('HTTP 503');
      return url.endsWith('summary.json') ? { page: { name: 'X' }, status: { indicator: 'minor', description: 'Minor' }, components: [] } : { incidents: [] };
    },
  };
  const monitor = new Monitor([provider], { ctx, log: { info() {}, warn() {}, error() {} } });
  assert.equal(monitor.get('x').status, 'pending');
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'degraded');
  assert.deepEqual(monitor.get('x').history, []);
  fail = true;
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'degraded');
  await monitor.cycle();
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'unknown');
  assert.equal(monitor.get('x').error, 'HTTP 503');
});

test('pages escape everything a provider sends', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const s = state({
    provider: { slug: 'x', name: 'X & Co', category: 'dev', page: 'https://status.x.test' },
    status: 'degraded',
    description: `"${evil}`,
    components: [{ name: evil, status: 'degraded', group: evil }],
    componentCount: 1,
    componentIssues: 1,
    incidents: [{ ...inc('i', 'minor', at(0, -1)), name: evil, status: evil, url: 'https://status.x.test/i?a=1&b="2', updates: [{ at: at(0), status: evil, body: `${evil}</p><script>alert(2)</script>` }] }],
  });
  const summary = buildSummary([s], NOW);
  for (const page of [renderHome(summary), renderDetail(s, summary)]) {
    assert.ok(!page.includes('<img'), 'raw tag leaked');
    assert.ok(!page.includes('<script>alert'), 'raw script leaked');
    assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(page.includes('X &amp; Co'));
  }
});
