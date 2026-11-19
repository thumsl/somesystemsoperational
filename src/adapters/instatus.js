import { components, incident, impactToStatus, worstStatus } from '../normalize.js';

const IMPACT = {
  OPERATIONAL: 'none',
  DEGRADEDPERFORMANCE: 'minor',
  PARTIALOUTAGE: 'major',
  MAJOROUTAGE: 'critical',
  UNDERMAINTENANCE: 'maintenance',
};
const COMPONENT = {
  OPERATIONAL: 'operational',
  DEGRADEDPERFORMANCE: 'degraded',
  PARTIALOUTAGE: 'partial_outage',
  MAJOROUTAGE: 'major_outage',
  UNDERMAINTENANCE: 'maintenance',
};

function pageStatus(value) {
  const s = String(value || '').toUpperCase();
  if (s === 'UP') return 'operational';
  if (s.includes('MAJOROUTAGE')) return 'major_outage';
  if (s.includes('PARTIALOUTAGE')) return 'partial_outage';
  if (s.includes('MAINTENANCE')) return 'maintenance';
  return 'degraded';
}

export function parseSummary(json) {
  if (!json?.page?.status) throw new Error('not an Instatus summary');
  const incidents = (json.activeIncidents || []).map((i) =>
    incident({
      id: i.id,
      name: i.name,
      impact: IMPACT[String(i.impact || '').toUpperCase()] ?? 'minor',
      status: i.status,
      startedAt: i.started,
      updatedAt: i.updatedAt,
      url: i.url,
      updates: i.lastUpdate?.message ? [{ at: i.lastUpdate.createdAt, status: i.status, body: i.lastUpdate.message }] : [],
    }),
  );
  const maintenances = (json.activeMaintenances || [])
    .filter((m) => String(m.status || '').toUpperCase() === 'INPROGRESS')
    .map((m) => incident({ id: m.id, name: m.name, impact: 'maintenance', status: 'In progress', startedAt: m.start, url: m.url }));

  const fromIncidents = worstStatus(incidents.map((i) => impactToStatus(i.impact)));
  const fromPage = pageStatus(json.page.status);
  return {
    status: fromIncidents !== 'operational' ? fromIncidents : fromPage,
    description: '',
    incidents: [...incidents, ...maintenances],
  };
}

export function parseComponents(json) {
  const list = Array.isArray(json?.components) ? json.components : [];
  return components(
    list.map((c) => ({ name: c.name, status: COMPONENT[String(c.status || '').toUpperCase()] ?? 'operational', group: c.group?.name })),
  );
}

export default {
  async current(provider, { getJson }) {
    return parseSummary(await getJson(`${provider.base}/summary.json`));
  },
  async slow(provider, { getJson }) {
    return parseComponents(await getJson(`${provider.base}/v2/components.json`));
  },
};
