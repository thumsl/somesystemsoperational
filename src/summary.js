/** Builds the internet-wide picture the pages and the API are rendered from. */
import { HISTORY_DAYS } from './config.js';
import { CATEGORIES } from './providers.js';
import { IMPACT_RANK, STATUS_RANK } from './normalize.js';
import { DAY, historyWindow, internetDays, providerDays, quietTime, startedWithin } from './history.js';

const isAffected = (status) => STATUS_RANK[status] > 0;

export function headline(counts, total, tier1Major) {
  const affected = counts.degraded + counts.partial_outage + counts.major_outage;
  const checked = total - counts.pending;
  if (checked < total / 2) return { level: 'pending', title: 'Checking the Internet' };
  if (counts.operational === 0) return { level: 'bad', title: 'No Systems Operational' };
  if (affected === 0 && counts.unknown === 0) return { level: 'ok', title: 'All Systems Operational' };
  const widespread = affected / checked >= 0.2 || counts.major_outage >= 3 || tier1Major.length > 0;
  if (counts.operational < checked / 2) return { level: 'bad', title: 'Few Systems Operational' };
  return { level: widespread ? 'bad' : 'warn', title: 'Some Systems Operational' };
}

export function buildSummary(states, now) {
  const win = historyWindow(now, HISTORY_DAYS);
  const counts = { operational: 0, degraded: 0, partial_outage: 0, major_outage: 0, maintenance: 0, unknown: 0, pending: 0 };
  const rows = states.map((state) => {
    counts[state.status] = (counts[state.status] ?? 0) + 1;
    return { state, days: providerDays(state, win, now) };
  });

  const tier1Major = states.filter((s) => s.provider.tier1 && s.status === 'major_outage').map((s) => s.provider.name);

  const incidents = states
    .flatMap((state) => state.incidents.filter((i) => i.impact !== 'maintenance').map((incident) => ({ state, incident })))
    .sort(
      (a, b) =>
        IMPACT_RANK[b.incident.impact] - IMPACT_RANK[a.incident.impact] ||
        String(b.incident.startedAt).localeCompare(String(a.incident.startedAt)),
    );

  const categories = CATEGORIES.map(([key, name]) => {
    const list = rows
      .filter((r) => r.state.provider.category === key)
      .sort((a, b) => Number(Boolean(b.state.provider.tier1)) - Number(Boolean(a.state.provider.tier1)));
    return {
      key,
      name,
      rows: list,
      operational: list.filter((r) => r.state.status === 'operational' || r.state.status === 'maintenance').length,
      affected: list.filter((r) => isAffected(r.state.status)).length,
    };
  }).filter((c) => c.rows.length);

  const last30 = startedWithin(states, now, 30 * DAY);
  return {
    now,
    win,
    total: states.length,
    counts,
    affected: counts.degraded + counts.partial_outage + counts.major_outage,
    headline: headline(counts, states.length, tier1Major),
    tier1Major,
    incidents,
    servicesWithIncidents: new Set(incidents.map((i) => i.state.provider.slug)).size,
    categories,
    internet: internetDays(rows.map((r) => r.days), win),
    quiet: quietTime(states, win, now),
    last24h: startedWithin(states, now, DAY),
    last30d: last30,
    perDay: last30 / 30,
    checkedAt: states.reduce((max, s) => Math.max(max, s.okAt ?? 0), 0) || null,
  };
}
