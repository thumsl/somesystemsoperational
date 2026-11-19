import { IMPACT_RANK } from './normalize.js';

export const DAY = 86_400_000;

export function historyWindow(now, days) {
  const end = Math.floor(now / DAY) * DAY + DAY;
  return { start: end - days * DAY, end, days };
}

export function impactfulIncidents(state) {
  const byId = new Map();
  for (const i of state.history || []) byId.set(i.id, i);
  for (const i of state.incidents || []) byId.set(i.id, i);
  return [...byId.values()].filter((i) => IMPACT_RANK[i.impact] > 0 && i.startedAt);
}

export function providerDays(state, win, now) {
  const levels = new Array(win.days).fill(-1);
  const counts = new Array(win.days).fill(0);
  if (!state.history) return { levels, counts };

  const coverage = state.coverageStart ? Math.max(Date.parse(state.coverageStart), win.start) : win.start;
  const firstDay = Math.min(win.days, Math.max(0, Math.floor((coverage - win.start) / DAY)));
  const today = Math.min(win.days - 1, Math.floor((now - win.start) / DAY));
  for (let d = firstDay; d <= today; d++) levels[d] = 0;

  for (const incident of impactfulIncidents(state)) {
    const start = Date.parse(incident.startedAt);
    const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : now;
    if (Number.isNaN(start) || end < win.start || start > now) continue;
    const from = Math.max(firstDay, Math.floor((Math.max(start, win.start) - win.start) / DAY));
    const to = Math.min(today, Math.floor((Math.min(Math.max(end, start), now) - win.start) / DAY));
    const level = IMPACT_RANK[incident.impact];
    for (let d = from; d <= to; d++) {
      levels[d] = Math.max(levels[d], level);
      counts[d]++;
    }
  }
  return { levels, counts };
}

export function internetDays(perProvider, win) {
  const out = { levels: [], incidents: [], affected: [], covered: [] };
  for (let d = 0; d < win.days; d++) {
    const known = perProvider.filter((p) => p.levels[d] >= 0);
    const affected = known.filter((p) => p.levels[d] > 0).length;
    const share = affected / known.length;
    out.levels.push(!known.length ? -1 : !affected ? 0 : share <= 0.08 ? 1 : share <= 0.16 ? 2 : 3);
    out.incidents.push(known.reduce((n, p) => n + p.counts[d], 0));
    out.affected.push(affected);
    out.covered.push(known.length);
  }
  return out;
}

export function quietTime(states, win, now) {
  const intervals = [];
  for (const state of states) {
    for (const incident of impactfulIncidents(state)) {
      const start = Math.max(Date.parse(incident.startedAt), win.start);
      const end = Math.min(incident.resolvedAt ? Date.parse(incident.resolvedAt) : now, now);
      if (end > start) intervals.push([start, end]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);

  let busy = 0;
  let longest = 0;
  let cursor = win.start;
  for (const [start, end] of [...intervals, [now, now]]) {
    if (start > cursor) {
      longest = Math.max(longest, start - cursor);
      cursor = start;
    }
    if (end > cursor) {
      busy += end - cursor;
      cursor = end;
    }
  }

  const total = now - win.start;
  return { fraction: total > 0 ? Math.max(0, 1 - busy / total) : 0, longestMs: longest };
}

export const startedWithin = (states, now, ms) =>
  states.flatMap(impactfulIncidents).filter((i) => Date.parse(i.startedAt) <= now && now - Date.parse(i.startedAt) <= ms).length;
