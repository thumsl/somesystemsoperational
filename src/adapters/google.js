import { incident, impactToStatus, worstStatus } from '../normalize.js';

function impactOf(raw) {
  if (raw.status_impact === 'SERVICE_OUTAGE') return 'critical';
  if (raw.status_impact === 'SERVICE_DISRUPTION') return raw.severity === 'high' ? 'major' : 'minor';
  return 'none';
}

export function parseIncidents(json, base) {
  if (!Array.isArray(json)) throw new Error('not a Google incident list');
  const history = json
    .map((raw) => {
      const products = (raw.affected_products || []).map((p) => p.title).filter(Boolean);
      const latest = raw.most_recent_update || {};
      const name = raw.external_desc || (products.length ? `Issue affecting ${products.slice(0, 3).join(', ')}` : 'Incident');
      return incident({
        id: raw.id,
        name: String(name).replace(/\*\*/g, '').split('\n').find((line) => line.trim() && !/^summary:?$/i.test(line.trim())) || name,
        impact: impactOf(raw),
        status: raw.end ? 'Resolved' : latest.status === 'AVAILABLE' ? 'Monitoring' : 'Ongoing',
        startedAt: raw.begin,
        resolvedAt: raw.end,
        updatedAt: raw.modified,
        url: raw.uri ? `${base}/${String(raw.uri).replace(/^\/+/, '')}` : base,
        updates: (raw.updates || []).slice(0, 4).map((u) => ({ at: u.when || u.created, status: u.status, body: u.text })),
      });
    })
    .filter((i) => i.startedAt);
  const incidents = history.filter((i) => !i.resolvedAt);
  return {
    status: worstStatus(incidents.map((i) => impactToStatus(i.impact))),
    description: '',
    incidents,
    history,
    coverageStart: null,
  };
}

export default {
  async current(provider, { getJson }) {
    return parseIncidents(await getJson(`${provider.base}/incidents.json`), provider.page);
  },
};
