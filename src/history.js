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
  const levels = [];
  const incidents = [];
  const affected = [];
  const covered = [];
  for (let d = 0; d < win.days; d++) {
    let inc = 0;
    let aff = 0;
    let cov = 0;
    for (const { levels: l, counts: c } of perProvider) {
      if (l[d] < 0) continue;
      cov++;
      if (l[d] > 0) aff++;
      inc += c[d];
    }
    const share = cov ? aff / cov : 0;
    levels.push(cov === 0 ? -1 : aff === 0 ? 0 : share <= 0.08 ? 1 : share <= 0.16 ? 2 : 3);
    incidents.push(inc);
    affected.push(aff);
    covered.push(cov);
  }
  return { levels, incidents, affected, covered };
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
  let longestEnd = null;
  let cursor = win.start;
  const gap = (from, to) => {
    if (to - from > longest) {
      longest = to - from;
      longestEnd = to;
    }
  };
  for (const [start, end] of intervals) {
    if (start > cursor) {
      gap(cursor, start);
      cursor = start;
    }
    if (end > cursor) {
      busy += end - cursor;
      cursor = end;
    }
  }
  if (now > cursor) gap(cursor, now);

  const total = now - win.start;
  return { fraction: total > 0 ? Math.max(0, 1 - busy / total) : 0, longestMs: longest, longestEnd };
}

export function startedWithin(states, now, ms) {
  let n = 0;
  for (const state of states) {
    for (const incident of impactfulIncidents(state)) {
      const start = Date.parse(incident.startedAt);
      if (start <= now && now - start <= ms) n++;
    }
  }
  return n;
}
