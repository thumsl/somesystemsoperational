import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS } from '../src/adapters/index.js';
import { sitemap } from '../src/feeds.js';
import { DAY, historyWindow, providerDays, quietTime } from '../src/history.js';
import { Monitor } from '../src/monitor.js';
import { plainText, safeUrl, toIso } from '../src/normalize.js';
import { PROVIDERS } from '../src/providers.js';
import { bucketKey, clientIp, RateLimiter } from '../src/ratelimit.js';
import { renderCategory, renderDetail, renderHome } from '../src/render.js';
import { SelfMonitor } from '../src/self.js';
import { buildSummary, headline } from '../src/summary.js';
import { client } from '../src/usage.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const quiet = { info() {}, warn() {}, error() {} };
const at = (daysAgo, hour = 0) => new Date(NOW - daysAgo * DAY + hour * 3_600_000).toISOString();
const inc = (id, impact, startedAt, resolvedAt = null) => ({ id, name: id, impact, status: '', startedAt, resolvedAt, updatedAt: null, url: null, updates: [] });
const state = (over = {}) => ({ provider: { slug: 'x', name: 'X', category: 'dev', page: 'https://status.x.test' }, status: 'operational', description: '', incidents: [], components: [], componentCount: 0, componentIssues: 0, history: [], coverageStart: null, okAt: NOW, ...over });

test('provider text is cleaned on the way in', () => {
  assert.equal(plainText('<p>We&#39;re <b>on</b> it&nbsp;now</p><p>Second &amp; last</p>'), "We're on it now\nSecond & last");
  assert.equal(toIso(1794746282), new Date(1794746282000).toISOString());
  assert.equal(toIso('nonsense'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
});

test('history bars paint each day an incident touched', () => {
  const win = historyWindow(NOW, 90);
  assert.ok(providerDays(state({ history: null }), win, NOW).levels.every((l) => l === -1));

  const s = state({
    coverageStart: at(30),
    history: [inc('a', 'minor', at(10), at(10, 2)), inc('b', 'critical', at(5), at(3)), inc('n', 'none', at(1), at(1, 1)), inc('old', 'major', at(60), at(59))],
    incidents: [inc('live', 'major', at(0, -1))],
  });
  const { levels } = providerDays(s, win, NOW);
  assert.equal(levels[89 - 60], -1, 'before coverage');
  assert.equal(levels[89 - 10], 1);
  assert.deepEqual([levels[89 - 5], levels[89 - 4], levels[89 - 3]], [3, 3, 3]);
  assert.equal(levels[89 - 1], 0, 'notices do not count');
  assert.equal(levels[89], 2, 'open incidents count for today');
});

test('quiet time is the time with no open incident anywhere', () => {
  const win = { start: NOW - 10 * DAY, end: NOW, days: 10 };
  const a = state({ history: [inc('a', 'minor', at(10), at(6))] });
  const b = state({ history: [inc('b', 'major', at(7), at(4))], incidents: [inc('c', 'minor', at(1))] });
  const q = quietTime([a, b], win, NOW);
  assert.ok(Math.abs(q.fraction - 0.3) < 1e-9);
  assert.equal(q.longestMs, 3 * DAY);
});

test('headline follows how much of the internet is up', () => {
  const counts = (over) => ({ operational: 0, degraded: 0, partial_outage: 0, major_outage: 0, maintenance: 0, unknown: 0, pending: 0, ...over });
  assert.equal(headline(counts({ operational: 100 }), 100, []).title, 'All Systems Operational');
  assert.deepEqual(headline(counts({ operational: 90, degraded: 10 }), 100, []), { level: 'warn', title: 'Some Systems Operational' });
  assert.equal(headline(counts({ operational: 99, major_outage: 1 }), 100, ['AWS']).level, 'bad');
  assert.equal(headline(counts({ operational: 30, degraded: 70 }), 100, []).title, 'Few Systems Operational');
  assert.equal(headline(counts({ degraded: 100 }), 100, []).title, 'No Systems Operational');
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
  for (const reserved of ['api', 'about', 'assets', 'health', 'status']) assert.ok(!slugs.has(reserved), reserved);
});

test('monitor keeps the last status through a blip and gives up after repeated failures', async () => {
  const provider = { slug: 'x', name: 'X', category: 'dev', type: 'statuspage', base: 'https://x.test', page: 'https://x.test' };
  let fail = false;
  const ctx = {
    now: () => NOW,
    getJson: async (url) => {
      if (fail) throw new Error('HTTP 503');
      return url.endsWith('summary.json') ? { page: { name: 'X' }, status: { indicator: 'minor' }, components: [] } : { incidents: [] };
    },
  };
  const monitor = new Monitor([provider], { ctx, log: quiet });
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'degraded');
  fail = true;
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'degraded');
  await monitor.cycle();
  await monitor.cycle();
  assert.equal(monitor.get('x').status, 'unknown');
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
  for (const page of [renderHome(summary), renderDetail(s, summary), renderCategory(summary.categories[0], summary)]) {
    assert.ok(!page.includes('<img'), 'raw tag leaked');
    assert.ok(!page.includes('<script>alert'), 'raw script leaked');
    assert.ok(page.includes('X &amp; Co'));
  }
});

test('service pages answer the question people search for', () => {
  const s = state({ provider: { slug: 'x', name: 'X', category: 'dev', page: 'https://status.x.test', aka: ['Zune'] }, status: 'partial_outage', incidents: [inc('i', 'major', at(0, -1))] });
  const summary = buildSummary([s], NOW);
  const page = renderDetail(s, summary);
  assert.match(page, /<title>Is X \(Zune\) down\? /);
  assert.match(page, /Partly\. X reports a partial outage/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.ok(sitemap(summary).includes('/status/developer-tools</loc>'));
});

test('rate limiter: a burst, then a steady refill, per client', () => {
  let now = 0;
  const limiter = new RateLimiter({ capacity: 3, refillPerSec: 1, now: () => now });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('a')), [true, true, true, false]);
  assert.equal(limiter.take('b'), true);
  now += 2_000;
  assert.deepEqual([1, 2, 3].map(() => limiter.take('a')), [true, true, false]);

  const req = (headers) => ({ headers, socket: { remoteAddress: '10.0.0.5' } });
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' })), '198.51.100.7', 'a forged first entry is ignored');
  assert.equal(bucketKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), bucketKey('2001:0db8:0001:0002::1'), 'IPv6 is limited per /64');
});

test('the site opens and closes its own incidents', () => {
  let now = NOW;
  const self = new SelfMonitor({ pollIntervalMs: 120_000, now: () => now, log: quiet });
  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  assert.equal(self.tick().status, 'operational');

  self.recordCycle({ total: 100, failed: Array.from({ length: 30 }, (_, i) => `Svc ${i}`), durationMs: 15_000 });
  now += 15_000;
  const broken = self.tick();
  assert.equal(broken.status, 'partial_outage');
  assert.match(broken.incidents[0].updates[0].body, /30 of 100 status pages did not answer/);

  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  now += 15_000;
  const fixed = self.tick();
  assert.equal(fixed.status, 'operational');
  assert.ok(fixed.history[0].resolvedAt);
});

test('API callers are labelled by what they are, not who', () => {
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  assert.deepEqual(client(chrome), { userAgent: chrome });
  assert.deepEqual(client('python-requests/2.32.3'), { browser: 'python-requests', os: '', device: '' });
  assert.equal(client('').browser, 'unknown');
});
