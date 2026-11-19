import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, parseIncidents } from '../src/adapters/statuspage.js';
import { parseSummary as parseInstatus } from '../src/adapters/instatus.js';
import { parseIndex } from '../src/adapters/betterstack.js';
import { parseIncidents as parseGoogle } from '../src/adapters/google.js';
import { parseCurrent as parseAwsCurrent, parseHistory as parseAwsHistory } from '../src/adapters/aws.js';
import { parseApple, parseAzure, parseFastly, parseM365, parseSlackCurrent, parseStatusio } from '../src/adapters/misc.js';

const PAGE = 'https://status.example.com';

test('statuspage: maps the indicator, groups components and drops resolved incidents', () => {
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
        { id: 'a', name: 'API errors', status: 'investigating', impact: 'major', created_at: '2026-11-18T10:00:00Z', shortlink: 'https://stspg.io/a', incident_updates: [{ status: 'investigating', body: 'Looking <b>into</b> it', created_at: '2026-11-18T10:00:00Z' }] },
        { id: 'b', name: 'Old one', status: 'resolved', impact: 'minor', created_at: '2026-11-01T10:00:00Z' },
      ],
      scheduled_maintenances: [
        { id: 'm', name: 'DB upgrade', status: 'in_progress', impact: 'minor', created_at: '2026-11-18T09:00:00Z' },
        { id: 'n', name: 'Later', status: 'scheduled', created_at: '2026-11-18T09:00:00Z' },
      ],
    },
    PAGE,
  );
  assert.equal(state.status, 'partial_outage');
  assert.equal(state.description, 'Partial System Outage');
  assert.deepEqual(state.components, [
    { name: 'REST', status: 'partial_outage', group: 'API' },
    { name: 'Website', status: 'operational', group: null },
  ]);
  assert.deepEqual(state.incidents.map((i) => [i.id, i.impact]), [['a', 'major'], ['m', 'maintenance']]);
  assert.equal(state.incidents[0].updates[0].body, 'Looking into it');
  assert.equal(state.incidents[0].status, 'Investigating');
});

test('statuspage: works without an incidents key (incident.io) and rejects other documents', () => {
  const state = parseSummary({ page: { name: 'X' }, status: { indicator: 'none', description: 'All Systems Operational' }, components: [] }, PAGE);
  assert.equal(state.status, 'operational');
  assert.deepEqual(state.incidents, []);
  assert.throws(() => parseSummary({ hello: 'world' }, PAGE));
});

test('statuspage: a full page of incidents limits how far back history is trusted', () => {
  const make = (n) => ({ incidents: Array.from({ length: n }, (_, i) => ({ id: i, name: `i${i}`, impact: 'minor', status: 'resolved', created_at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), resolved_at: new Date(Date.UTC(2026, 9, 1 + i, 2)).toISOString() })) });
  assert.equal(parseIncidents(make(7), PAGE).coverageStart, null);
  assert.equal(parseIncidents(make(50), PAGE).coverageStart, '2026-10-01T00:00:00.000Z');
  assert.equal(parseIncidents(make(7), PAGE).history[0].url, `${PAGE}/incidents/0`);
});

test('instatus: incident impact decides the status', () => {
  const state = parseInstatus({
    page: { name: 'X', status: 'HASISSUES' },
    activeIncidents: [{ id: '1', name: 'Sync failing', started: '2026-11-17T11:22:22Z', status: 'IDENTIFIED', impact: 'MAJOROUTAGE', url: 'https://x.test/1', lastUpdate: { message: 'Working on it', createdAt: '2026-11-18T00:00:00Z' } }],
  });
  assert.equal(state.status, 'major_outage');
  assert.equal(state.incidents[0].impact, 'critical');
  assert.equal(parseInstatus({ page: { status: 'UP' } }).status, 'operational');
  assert.equal(parseInstatus({ page: { status: 'HASISSUES' } }).status, 'degraded');
});

test('betterstack: open reports are active, resolved ones keep their worst impact', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  const state = parseIndex(
    {
      data: { attributes: { aggregate_state: 'degraded' } },
      included: [
        { id: '1', type: 'status_page_section', attributes: { name: 'Apps' } },
        { id: '10', type: 'status_page_resource', attributes: { status_page_section_id: 1, public_name: 'Dashboard', status: 'degraded' } },
        { id: '11', type: 'status_page_resource', attributes: { status_page_section_id: 1, public_name: 'API', status: 'operational' } },
        { id: 'r1', type: 'status_report', attributes: { title: 'Dashboard slow', report_type: 'manual', starts_at: '2026-11-18T23:35:00Z', ends_at: null, aggregate_state: 'degraded' }, relationships: { status_updates: { data: [{ id: 'u1' }] } } },
        { id: 'r2', type: 'status_report', attributes: { title: 'API down', report_type: 'manual', starts_at: '2026-11-10T10:00:00Z', ends_at: null, aggregate_state: 'resolved' }, relationships: { status_updates: { data: [{ id: 'u2' }, { id: 'u3' }] } } },
        { id: 'r3', type: 'status_report', attributes: { title: 'Planned', report_type: 'maintenance', starts_at: '2026-11-23T01:00:00Z', ends_at: '2026-11-23T02:00:00Z', aggregate_state: 'maintenance' } },
        { id: 'u1', type: 'status_update', attributes: { message: 'Investigating', published_at: '2026-11-18T23:40:00Z', affected_resources: [{ status: 'degraded' }] } },
        { id: 'u2', type: 'status_update', attributes: { message: 'Down', published_at: '2026-11-10T10:05:00Z', affected_resources: [{ status: 'downtime' }] } },
        { id: 'u3', type: 'status_update', attributes: { message: 'Fixed', published_at: '2026-11-10T11:00:00Z', affected_resources: [{ status: 'resolved' }] } },
      ],
    },
    PAGE,
    now,
  );
  assert.equal(state.status, 'degraded');
  assert.deepEqual(state.incidents.map((i) => i.name), ['Dashboard slow']);
  const resolved = state.history.find((i) => i.name === 'API down');
  assert.equal(resolved.impact, 'major');
  assert.equal(resolved.resolvedAt, '2026-11-10T11:00:00.000Z');
  assert.equal(state.history.length, 2, 'future maintenance is not history');
  assert.equal(state.coverageStart, '2026-11-10T10:00:00.000Z');
  assert.equal(state.components[0].group, 'Apps');
});

test('google: only incidents without an end are active', () => {
  const state = parseGoogle(
    [
      { id: 'a', begin: '2026-11-18T10:00:00+00:00', end: null, external_desc: '**Summary:**\nCloud Run is failing\nMore text', status_impact: 'SERVICE_OUTAGE', severity: 'high', uri: 'incidents/a', most_recent_update: { status: 'SERVICE_OUTAGE' } },
      { id: 'b', begin: '2026-10-20T06:00:00+00:00', end: '2026-10-20T12:08:00+00:00', external_desc: 'Old', status_impact: 'SERVICE_DISRUPTION', severity: 'medium', uri: 'incidents/b' },
    ],
    'https://status.cloud.google.com',
  );
  assert.equal(state.status, 'major_outage');
  assert.equal(state.incidents.length, 1);
  assert.equal(state.incidents[0].name, 'Cloud Run is failing');
  assert.equal(state.incidents[0].url, 'https://status.cloud.google.com/incidents/a');
  assert.equal(state.history[1].impact, 'minor');
  assert.equal(parseGoogle([], 'x').status, 'operational');
});

test('aws: a disruption is a partial outage; history is de-duplicated across services', () => {
  const event = { date: '1794746282', arn: 'arn:1', region_name: 'N. Virginia', status: '3', service_name: 'Amazon EC2', summary: '[RESOLVED] Increased error rates', event_log: [{ summary: 'Investigating', message: 'We are investigating', status: 3, timestamp: 1794746282 }, { summary: 'Resolved', message: 'Done', status: 1, timestamp: 1794750000 }] };
  const current = parseAwsCurrent([event]);
  assert.equal(current.status, 'partial_outage');
  assert.equal(current.incidents[0].name, 'Amazon EC2: Increased error rates (N. Virginia)');
  assert.equal(current.incidents[0].resolvedAt, null);
  assert.equal(parseAwsCurrent([]).status, 'operational');

  const { history } = parseAwsHistory({ 'ec2-us-east-1': [event], 'multipleservices-us-east-1': [event] });
  assert.equal(history.length, 1);
  assert.equal(history[0].resolvedAt, new Date(1794750000 * 1000).toISOString());
});

test('azure: an empty feed is operational, items are incidents', () => {
  const empty = '<?xml version="1.0"?><rss version="2.0"><channel><title>Azure Status</title></channel></rss>';
  assert.equal(parseAzure(empty).status, 'operational');
  const busy = empty.replace('</channel>', '<item><title>Outage in West Europe</title><description><![CDATA[<p>Storage is failing</p>]]></description><pubDate>Thu, 19 Nov 2026 01:03:00 Z</pubDate><link>https://azure.status.microsoft/x</link></item></channel>');
  const state = parseAzure(busy);
  assert.equal(state.status, 'partial_outage');
  assert.equal(state.incidents[0].name, 'Outage in West Europe');
  assert.equal(state.incidents[0].updates[0].body, 'Storage is failing');
  assert.throws(() => parseAzure('<html></html>'));
});

test('apple: reads JSON and JSONP, only ongoing events count', () => {
  const doc = { services: [
    { serviceName: 'App Store', events: [{ messageId: '1', statusType: 'Outage', eventStatus: 'resolved', message: 'Was down', epochStartDate: 1794933900000, epochEndDate: 1794945600000 }] },
    { serviceName: 'iCloud Mail', events: [{ messageId: '2', statusType: 'Issue', eventStatus: 'ongoing', message: 'Slow', epochStartDate: 1794933900000, epochEndDate: null }] },
    { serviceName: 'Maps', events: [] },
  ] };
  for (const text of [JSON.stringify(doc), `jsonCallback(${JSON.stringify(doc)});`]) {
    const state = parseApple(text, 'https://www.apple.com/support/systemstatus/');
    assert.equal(state.status, 'degraded');
    assert.deepEqual(state.incidents.map((i) => i.name), ['iCloud Mail: Issue']);
    assert.equal(state.history.length, 2);
    assert.equal(state.componentCount, 3);
  }
});

test('one-off formats map their own vocabulary', () => {
  assert.equal(parseSlackCurrent({ status: 'ok', active_incidents: [] }).status, 'operational');
  assert.equal(parseSlackCurrent({ status: 'active', active_incidents: [{ id: 1, title: 'Down', type: 'outage', status: 'active', date_created: '2026-11-11T07:24:01-08:00', notes: [{ body: '<p>We&#39;re on it</p>' }] }] }).status, 'major_outage');

  const m365 = parseM365([{ ServiceDisplayName: 'Outlook.com', Status: 'Operational' }, { ServiceDisplayName: 'OneDrive', Status: 'ServiceInterruption', Title: 'Sync failing', LastUpdatedTime: '2026-11-19T01:03:00Z', AuthoredDateTime: '0001-01-01T00:00:00+00:00' }]);
  assert.equal(m365.status, 'partial_outage');
  assert.equal(m365.incidents[0].name, 'OneDrive: Sync failing');
  assert.equal(m365.incidents[0].startedAt, '2026-11-19T01:03:00.000Z');

  assert.equal(parseFastly({ Status: 'Maintenance', StatusText: 'Maintenance' }).status, 'maintenance');
  assert.equal(parseFastly({ Status: 'Normal' }).status, 'operational');
  assert.equal(parseFastly({ Status: 'Something new' }).status, 'degraded');

  const gitlab = parseStatusio({ result: { status_overall: { status: 'Partial Service Disruption', status_code: 400 }, status: [{ name: 'API', status_code: 100 }, { name: 'CI/CD', status_code: 400 }], incidents: [{ _id: 'x', name: 'CI delays', datetime_open: '2026-11-18T10:00:00Z', messages: [{ details: 'Investigating', datetime: '2026-11-18T10:05:00Z' }] }] } }, PAGE);
  assert.equal(gitlab.status, 'partial_outage');
  assert.equal(gitlab.incidents[0].impact, 'major');
  assert.equal(gitlab.components[1].status, 'partial_outage');
});
