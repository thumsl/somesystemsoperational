import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, parseIncidents } from '../src/adapters/statuspage.js';
import { parseSummary as parseInstatus } from '../src/adapters/instatus.js';
import { parseIndex } from '../src/adapters/betterstack.js';
import { parseCurrent as parseAws, parseHistory as parseAwsHistory } from '../src/adapters/aws.js';
import { parseApple } from '../src/adapters/misc.js';

const PAGE = 'https://status.example.com';

test('statuspage: indicator, grouped components, open incidents only', () => {
  const state = parseSummary(
    {
      page: { name: 'Example' },
      status: { indicator: 'major', description: 'Partial System Outage' },
      components: [
        { id: 'g1', name: 'API', group: true, status: 'partial_outage' },
        { id: 'c1', name: 'REST', group_id: 'g1', status: 'partial_outage' },
        { id: 'c2', name: 'Website', status: 'operational' },
      ],
      incidents: [
        { id: 'a', name: 'API errors', status: 'investigating', impact: 'major', created_at: '2026-11-18T10:00:00Z', incident_updates: [{ status: 'investigating', body: 'Looking <b>into</b> it', created_at: '2026-11-18T10:00:00Z' }] },
        { id: 'b', name: 'Old one', status: 'resolved', impact: 'minor', created_at: '2026-11-01T10:00:00Z' },
      ],
      scheduled_maintenances: [
        { id: 'm', name: 'DB upgrade', status: 'in_progress', created_at: '2026-11-18T09:00:00Z' },
        { id: 'n', name: 'Later', status: 'scheduled', created_at: '2026-11-18T09:00:00Z' },
      ],
    },
    PAGE,
  );
  assert.equal(state.status, 'partial_outage');
  assert.deepEqual(state.components, [
    { name: 'REST', status: 'partial_outage', group: 'API' },
    { name: 'Website', status: 'operational', group: null },
  ]);
  assert.deepEqual(state.incidents.map((i) => [i.id, i.impact]), [['a', 'major'], ['m', 'maintenance']]);
  assert.equal(state.incidents[0].updates[0].body, 'Looking into it');
  assert.throws(() => parseSummary({ hello: 'world' }, PAGE));
});

test('statuspage: a full page of incidents limits how far back history is trusted', () => {
  const make = (n) => ({ incidents: Array.from({ length: n }, (_, i) => ({ id: i, name: `i${i}`, impact: 'minor', status: 'resolved', created_at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })) });
  assert.equal(parseIncidents(make(7), PAGE).coverageStart, null);
  assert.equal(parseIncidents(make(50), PAGE).coverageStart, '2026-10-01T00:00:00.000Z');
});

test('instatus: incident impact decides the status', () => {
  const state = parseInstatus({
    page: { status: 'HASISSUES' },
    activeIncidents: [{ id: '1', name: 'Sync failing', started: '2026-11-17T11:22:22Z', status: 'IDENTIFIED', impact: 'MAJOROUTAGE' }],
  });
  assert.equal(state.status, 'major_outage');
  assert.equal(parseInstatus({ page: { status: 'UP' } }).status, 'operational');
  assert.equal(parseInstatus({ page: { status: 'HASISSUES' } }).status, 'degraded');
});

test('betterstack: open reports are active, future maintenance is not history', () => {
  const state = parseIndex(
    {
      data: { attributes: { aggregate_state: 'degraded' } },
      included: [
        { id: 'r1', type: 'status_report', attributes: { title: 'Dashboard slow', starts_at: '2026-11-18T23:35:00Z', aggregate_state: 'degraded' } },
        { id: 'r2', type: 'status_report', attributes: { title: 'API down', starts_at: '2026-11-10T10:00:00Z', aggregate_state: 'resolved' }, relationships: { status_updates: { data: [{ id: 'u2' }] } } },
        { id: 'r3', type: 'status_report', attributes: { title: 'Planned', report_type: 'maintenance', starts_at: '2026-11-23T01:00:00Z', aggregate_state: 'maintenance' } },
        { id: 'u2', type: 'status_update', attributes: { message: 'Down', published_at: '2026-11-10T11:00:00Z', affected_resources: [{ status: 'downtime' }] } },
      ],
    },
    PAGE,
    Date.parse('2026-11-19T00:00:00Z'),
  );
  assert.equal(state.status, 'degraded');
  assert.deepEqual(state.incidents.map((i) => i.name), ['Dashboard slow']);
  assert.deepEqual(state.history.map((i) => [i.name, i.impact]), [['Dashboard slow', 'minor'], ['API down', 'major']]);
  assert.equal(state.coverageStart, '2026-11-10T10:00:00.000Z');
});

test('aws: a disruption is a partial outage, history is de-duplicated', () => {
  const event = { date: '1794746282', arn: 'arn:1', region_name: 'N. Virginia', status: '3', service_name: 'Amazon EC2', summary: '[RESOLVED] Increased error rates', event_log: [{ summary: 'Resolved', message: 'Done', status: 1, timestamp: 1794750000 }] };
  const current = parseAws([event]);
  assert.equal(current.status, 'partial_outage');
  assert.equal(current.incidents[0].name, 'Amazon EC2: Increased error rates (N. Virginia)');
  assert.equal(parseAws([]).status, 'operational');
  assert.equal(parseAwsHistory({ 'ec2-us-east-1': [event], 'multipleservices-us-east-1': [event] }).history.length, 1);
});

test('apple: reads JSON and JSONP, only ongoing events count', () => {
  const doc = { services: [
    { serviceName: 'App Store', events: [{ messageId: '1', statusType: 'Outage', eventStatus: 'resolved', epochStartDate: 1794933900000, epochEndDate: 1794945600000 }] },
    { serviceName: 'iCloud Mail', events: [{ messageId: '2', statusType: 'Issue', eventStatus: 'ongoing', epochStartDate: 1794933900000 }] },
  ] };
  for (const text of [JSON.stringify(doc), `jsonCallback(${JSON.stringify(doc)});`]) {
    const state = parseApple(text, PAGE);
    assert.equal(state.status, 'degraded');
    assert.deepEqual(state.incidents.map((i) => i.name), ['iCloud Mail: Issue']);
    assert.equal(state.history.length, 2);
  }
});
