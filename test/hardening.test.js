import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bucketKey, clientIp, RateLimiter } from '../src/ratelimit.js';
import { SelfMonitor } from '../src/self.js';

const quiet = { info() {}, warn() {}, error() {} };

test('rate limiter: a burst, then a steady refill, per client', () => {
  let now = 0;
  const limiter = new RateLimiter({ capacity: 3, refillPerSec: 1, now: () => now });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('a')), [true, true, true, false]);
  assert.equal(limiter.take('b'), true, 'other clients are unaffected');
  assert.equal(limiter.retryAfter('a'), 1);
  now += 2_000;
  assert.deepEqual([1, 2, 3].map(() => limiter.take('a')), [true, true, false]);
  now += 60_000;
  limiter.prune();
  assert.equal(limiter.buckets.size, 0);
});

test('rate limiter: forgets the least recently seen client when full', () => {
  const limiter = new RateLimiter({ capacity: 1, refillPerSec: 0.001, maxKeys: 2, now: () => 0 });
  limiter.take('a');
  limiter.take('b');
  limiter.take('a');
  limiter.take('c');
  assert.deepEqual([...limiter.buckets.keys()], ['a', 'c']);
});

test('clients are identified by the address our proxy saw, IPv6 by /64', () => {
  assert.equal(bucketKey('203.0.113.9'), '203.0.113.9');
  assert.equal(bucketKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(bucketKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), bucketKey('2001:0db8:0001:0002::1'));
  assert.notEqual(bucketKey('2001:db8:1:2::1'), bucketKey('2001:db8:1:3::1'));
  assert.equal(bucketKey('2001:db8::1'), '2001:db8:0:0');

  const req = (headers) => ({ headers, socket: { remoteAddress: '10.0.0.5' } });
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' })), '198.51.100.7', 'a forged first entry is ignored');
  assert.equal(clientIp(req({})), '10.0.0.5');
  assert.equal(clientIp(req({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '172.70.1.1' }), 'cf-connecting-ip'), '198.51.100.9');
});

test('self: opens an incident when status pages cannot be read and closes it when they can', () => {
  let now = Date.parse('2026-11-18T12:00:00Z');
  const self = new SelfMonitor({ pollIntervalMs: 120_000, now: () => now, log: quiet });
  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  assert.equal(self.tick().status, 'operational');

  self.recordCycle({ total: 100, failed: Array.from({ length: 30 }, (_, i) => `Svc ${i}`), durationMs: 15_000 });
  now += 15_000;
  let state = self.tick();
  assert.equal(state.status, 'partial_outage');
  assert.equal(state.incidents.length, 1);
  assert.equal(state.incidents[0].impact, 'major');
  assert.match(state.incidents[0].updates[0].body, /30 of 100 status pages did not answer.*Svc 0.*and 22 more/);
  assert.equal(state.components.find((c) => c.name === 'Status collection').status, 'partial_outage');
  assert.equal(state.components.find((c) => c.name === 'Website').status, 'operational');

  self.recordCycle({ total: 100, failed: ['Svc 1'], durationMs: 9_000 });
  now += 15_000;
  state = self.tick();
  assert.equal(state.status, 'operational');
  assert.equal(state.incidents.length, 0);
  assert.equal(state.history.length, 1);
  assert.ok(state.history[0].resolvedAt);
  assert.equal(state.history[0].updates[0].status, 'Resolved');
});

test('self: stale data and floods are incidents too', () => {
  let now = Date.parse('2026-11-18T12:00:00Z');
  const self = new SelfMonitor({ pollIntervalMs: 120_000, now: () => now, log: quiet });
  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  self.tick();

  now += 7 * 60_000;
  assert.deepEqual(self.tick().incidents.map((i) => i.name), ['Status data is out of date']);
  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  now += 15_000;
  assert.equal(self.tick().incidents.length, 0);

  for (let i = 0; i < 500; i++) self.recordRequest(true);
  for (let i = 0; i < 40; i++) self.recordRequest(false);
  now += 15_000;
  self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
  const flooded = self.tick();
  assert.deepEqual(flooded.incidents.map((i) => i.name), ['Unusual traffic']);
  assert.equal(flooded.status, 'degraded');
  assert.match(flooded.incidents[0].updates[0].body, /Turned away 500 requests/);
  for (let i = 0; i < 8; i++) {
    now += 15_000;
    self.recordCycle({ total: 100, failed: [], durationMs: 9_000 });
    self.tick();
  }
  assert.equal(self.snapshot().incidents.length, 0, 'closes once the flood has passed');
});

test('self: history survives a restart, and a long silence is recorded as downtime', () => {
  const dir = mkdtempSync(join(tmpdir(), 'self-'));
  const file = join(dir, 'self.json');
  try {
    let now = Date.parse('2026-11-18T12:00:00Z');
    const first = new SelfMonitor({ file, pollIntervalMs: 120_000, now: () => now, log: quiet });
    assert.equal(first.persistent, true);
    first.recordCycle({ total: 100, failed: Array.from({ length: 10 }, (_, i) => `Svc ${i}`), durationMs: 9_000 });
    first.tick();
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).incidents.length, 1);

    // A rolling deploy: the next process starts seconds later.
    now += 20_000;
    const second = new SelfMonitor({ file, pollIntervalMs: 120_000, now: () => now, log: quiet });
    assert.equal(second.snapshot().history.length, 1);
    assert.ok(second.snapshot().history[0].resolvedAt, 'incidents left open are closed');
    assert.equal(second.snapshot().coverageStart, '2026-11-18T12:00:00.000Z');
    second.tick();

    // A crash: nothing runs for ten minutes.
    now += 10 * 60_000;
    const third = new SelfMonitor({ file, pollIntervalMs: 120_000, now: () => now, log: quiet });
    const down = third.snapshot().history.at(-1);
    assert.equal(down.name, 'This site was down');
    assert.equal(down.impact, 'critical');
    assert.equal(Date.parse(down.resolvedAt) - Date.parse(down.startedAt), 10 * 60_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
