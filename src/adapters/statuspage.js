import { components, incident, impactToStatus, worstStatus, clip, plainText } from '../normalize.js';

const INDICATOR = { none: 'operational', minor: 'degraded', major: 'partial_outage', critical: 'major_outage', maintenance: 'maintenance' };
const COMPONENT = {
  operational: 'operational',
  degraded_performance: 'degraded',
  partial_outage: 'partial_outage',
  major_outage: 'major_outage',
  full_outage: 'major_outage',
  under_maintenance: 'maintenance',
};
const CLOSED = new Set(['resolved', 'postmortem', 'completed']);
const IMPACTS = new Set(['none', 'minor', 'major', 'critical', 'maintenance']);

function toIncident(raw, pageUrl, impactOverride) {
  const closed = CLOSED.has(raw.status);
  return incident({
    id: raw.id,
    name: raw.name,
    impact: impactOverride ?? (IMPACTS.has(raw.impact) ? raw.impact : 'minor'),
    status: raw.status,
    startedAt: raw.started_at || raw.created_at,
    resolvedAt: raw.resolved_at || (closed ? raw.updated_at : null),
    updatedAt: raw.updated_at,
    url: raw.shortlink || (pageUrl && raw.id != null ? `${pageUrl.replace(/\/+$/, '')}/incidents/${raw.id}` : null),
    updates: (raw.incident_updates || []).map((u) => ({ at: u.display_at || u.created_at, status: u.status, body: u.body })),
  });
}

export function parseSummary(json, pageUrl) {
  if (!json || typeof json !== 'object' || !json.page) throw new Error('not a Statuspage summary');
  const raw = Array.isArray(json.components) ? json.components : [];
  const groupNames = new Map(raw.filter((c) => c.group).map((c) => [c.id, c.name]));
  const leaves = raw
    .filter((c) => !c.group)
    .map((c) => ({ name: c.name, status: COMPONENT[c.status] ?? 'operational', group: groupNames.get(c.group_id) }));

  const incidents = (json.incidents || []).filter((i) => !CLOSED.has(i.status)).map((i) => toIncident(i, pageUrl));
  const maintenances = (json.scheduled_maintenances || [])
    .filter((m) => m.status === 'in_progress' || m.status === 'verifying')
    .map((m) => toIncident(m, pageUrl, 'maintenance'));

  const indicator = json.status?.indicator;
  const status =
    INDICATOR[indicator] ??
    worstStatus([...leaves.map((c) => c.status), ...incidents.map((i) => impactToStatus(i.impact))]);

  return {
    status,
    description: clip(plainText(json.status?.description), 160),
    incidents: [...incidents, ...maintenances],
    ...components(leaves),
  };
}

export function parseIncidents(json, pageUrl) {
  const list = Array.isArray(json?.incidents) ? json.incidents : null;
  if (!list) throw new Error('not a Statuspage incident list');
  const history = list.map((i) => toIncident(i, pageUrl)).filter((i) => i.startedAt);
  const fullPage = list.length === 25 || list.length >= 50;
  const oldest = history.reduce((min, i) => (i.startedAt < min ? i.startedAt : min), history[0]?.startedAt ?? null);
  return { history, coverageStart: fullPage ? oldest : null };
}

export default {
  async current(provider, { getJson }) {
    return parseSummary(await getJson(`${provider.base}/api/v2/summary.json`), provider.page);
  },
  async slow(provider, { getJson }) {
    return parseIncidents(await getJson(`${provider.base}/api/v2/incidents.json`), provider.page);
  },
};
