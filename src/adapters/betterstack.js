/** Better Stack status pages (`/index.json`, a JSON:API document with current state and recent reports). */
import { components, incident, worstStatus } from '../normalize.js';

const STATE = { operational: 'operational', degraded: 'degraded', downtime: 'major_outage', maintenance: 'maintenance' };
const IMPACT = { degraded: 'minor', downtime: 'major', maintenance: 'maintenance' };

export function parseIndex(json, pageUrl, now = Date.now()) {
  const page = json?.data?.attributes;
  if (!page || !Array.isArray(json.included)) throw new Error('not a Better Stack status page');

  const byType = (type) => json.included.filter((x) => x.type === type);
  const sections = new Map(byType('status_page_section').map((s) => [Number(s.id), s.attributes?.name]));
  const updates = new Map(byType('status_update').map((u) => [u.id, u.attributes || {}]));

  const resources = byType('status_page_resource')
    .map((r) => r.attributes || {})
    .filter((a) => a.status !== 'not_monitored')
    .map((a) => ({ name: a.public_name, status: STATE[a.status] ?? 'operational', group: sections.get(a.status_page_section_id) }));

  const incidents = [];
  const history = [];
  for (const report of byType('status_report')) {
    const a = report.attributes || {};
    const start = Date.parse(a.starts_at);
    if (Number.isNaN(start) || start > now) continue; // scheduled for later
    const own = (report.relationships?.status_updates?.data || [])
      .map((ref) => updates.get(ref.id))
      .filter(Boolean)
      .sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)));
    const isMaintenance = a.report_type === 'maintenance';
    const plannedEnd = a.ends_at ? Date.parse(a.ends_at) : null;
    const resolved = a.aggregate_state === 'resolved' || a.aggregate_state === 'operational' || (plannedEnd != null && plannedEnd <= now);

    // A resolved report no longer says how bad it was; the updates still do.
    const seen = [a.aggregate_state, ...(a.affected_resources || []).map((r) => r.status), ...own.flatMap((u) => (u.affected_resources || []).map((r) => r.status))];
    const impact = isMaintenance ? 'maintenance' : seen.includes('downtime') ? 'major' : 'minor';

    const item = incident({
      id: report.id,
      name: a.title,
      impact: resolved ? impact : (IMPACT[a.aggregate_state] ?? impact),
      status: resolved ? 'Resolved' : isMaintenance ? 'In progress' : 'Ongoing',
      startedAt: a.starts_at,
      resolvedAt: resolved ? a.ends_at || own[0]?.published_at || a.starts_at : null,
      updatedAt: own[0]?.published_at,
      url: pageUrl,
      updates: own.map((u) => ({ at: u.published_at, status: '', body: u.message })),
    });
    history.push(item);
    if (!resolved) incidents.push(item);
  }

  const allDown = resources.length > 0 && resources.every((r) => r.status === 'major_outage');
  let status = STATE[page.aggregate_state] ?? worstStatus(resources.map((r) => r.status));
  // "downtime" on the page means at least one resource is down, which is a partial outage unless all are.
  if (status === 'major_outage' && !allDown) status = 'partial_outage';

  const oldest = history.reduce((min, i) => (i.startedAt < min ? i.startedAt : min), history[0]?.startedAt ?? null);
  return {
    status,
    description: '',
    incidents,
    history,
    // The document only carries recent reports, so history is trusted from the oldest one on.
    coverageStart: oldest ?? new Date(now).toISOString(),
    ...components(resources),
  };
}

export default {
  async current(provider, { getJson, now }) {
    return parseIndex(await getJson(`${provider.base}/index.json`), provider.page, now());
  },
};
