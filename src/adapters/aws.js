/**
 * AWS Health Dashboard public feeds.
 * `currentevents` lists open events (UTF-16 JSON); `historyevents.json` holds the past year by service.
 */
import { incident, impactToStatus, worstStatus } from '../normalize.js';

const CURRENT = 'https://health.aws.amazon.com/public/currentevents';
const HISTORY = 'https://history-events-us-west-2-prod.s3.amazonaws.com/historyevents.json';
const PAGE = 'https://health.aws.amazon.com/health/status';

// AWS event status: 1 = informational, 2 = degradation, 3 = disruption. A disruption is
// always scoped to a service or region, so it maps to a partial outage of AWS as a whole.
const IMPACT = { 1: 'minor', 2: 'minor', 3: 'major' };

function toIncident(raw, resolved) {
  const log = [...(raw.event_log || [])].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const peak = Math.max(Number(raw.status) || 0, ...log.map((e) => Number(e.status) || 0), ...(raw.impacted_service_status_changes || []).map((c) => Number(c.current_status) || 0));
  const where = raw.region_name ? ` (${raw.region_name})` : '';
  const title = String(raw.summary || log[0]?.summary || 'Service event').replace(/^\[RESOLVED\]\s*/i, '');
  return incident({
    id: raw.arn || `${raw.service}:${raw.date}`,
    name: `${raw.service_name ? `${raw.service_name}: ` : ''}${title}${where}`,
    impact: IMPACT[peak] ?? 'minor',
    status: resolved ? 'Resolved' : 'Ongoing',
    startedAt: Number(raw.date),
    resolvedAt: resolved ? Number(log[0]?.timestamp) || Number(raw.date) : null,
    updatedAt: Number(log[0]?.timestamp) || Number(raw.date),
    url: PAGE,
    updates: log.map((e) => ({ at: Number(e.timestamp), status: e.summary, body: e.message })),
  });
}

export function parseCurrent(json) {
  if (!Array.isArray(json)) throw new Error('not an AWS event list');
  const incidents = json.map((e) => toIncident(e, false)).filter((i) => i.startedAt);
  return { status: worstStatus(incidents.map((i) => impactToStatus(i.impact))), description: '', incidents };
}

export function parseHistory(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('not an AWS history document');
  const byId = new Map();
  for (const events of Object.values(json)) {
    for (const e of Array.isArray(events) ? events : []) {
      const item = toIncident(e, true);
      if (item.startedAt && !byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return { history: [...byId.values()], coverageStart: null };
}

export default {
  async current(_provider, { getJson }) {
    return parseCurrent(await getJson(CURRENT, { encoding: 'utf-16' }));
  },
  async slow(_provider, { getJson }) {
    return parseHistory(await getJson(HISTORY));
  },
};
