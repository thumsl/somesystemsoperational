/**
 * This site, tracked like any other service, from what it can actually measure about
 * itself: whether it can read the status pages, how fresh its data is, how busy the server
 * is and how much traffic it is turning away. Incidents open and close on their own and are
 * kept on disk, so the history survives restarts and shows the restarts that were outages.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { components, impactToStatus, worstStatus } from './normalize.js';

const DAY = 86_400_000;
const KEEP_MS = 100 * DAY;
/** A gap this long between heartbeats means the process was not running. Rolling deploys overlap, so they leave none. */
const DOWN_GAP_MS = 120_000;
const TRAFFIC_WINDOW_MS = 60_000;
const IMPACT = ['none', 'minor', 'major', 'critical'];

const span = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
const iso = (ms) => new Date(ms).toISOString();

export class SelfMonitor {
  /**
   * @param file            where history is kept; null keeps it in memory only
   * @param pollIntervalMs  how often a round of checks is expected to finish
   */
  constructor({ file = null, pollIntervalMs, now = Date.now, log = console } = {}) {
    this.file = file;
    this.pollIntervalMs = pollIntervalMs;
    this.now = now;
    this.log = log;
    this.bootedAt = now();
    this.since = this.bootedAt;
    this.incidents = [];
    this.streaks = {};
    this.cycle = null;
    this.traffic = []; // [at, served, rejected] per tick
    this.pending = { served: 0, rejected: 0 };
    this.loopDelayMs = 0;
    this.persistent = false;
    this.load();
  }

  load() {
    if (!this.file) return;
    const now = this.bootedAt;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
    } catch {
      // read-only or missing parent: the write below reports it
    }
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8'));
      this.since = Number(saved.since) || now;
      this.incidents = Array.isArray(saved.incidents) ? saved.incidents : [];
      const heartbeat = Number(saved.heartbeat) || 0;
      // Whatever was open when the last process stopped ended with it.
      for (const i of this.incidents) {
        if (!i.resolvedAt) this.close(i, heartbeat || now, 'Closed by a restart of the server.');
      }
      if (heartbeat && now - heartbeat > DOWN_GAP_MS) {
        this.incidents.push({
          id: `down:${heartbeat}`,
          key: 'down',
          name: 'This site was down',
          impact: 'critical',
          status: 'Resolved',
          startedAt: iso(heartbeat),
          resolvedAt: iso(now),
          updatedAt: iso(now),
          url: null,
          updates: [{ at: iso(now), status: 'Resolved', body: `Back up after ${span(now - heartbeat)} of nothing. The server process was not running: a crash, a reboot or a deploy that went badly.` }],
        });
      }
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn(`[self] could not read ${this.file}: ${err.message}`);
    }
    this.persistent = this.save();
    if (!this.persistent) this.log.warn(`[self] ${this.file} is not writable; own history will not survive restarts`);
  }

  save() {
    if (!this.file) return false;
    const now = this.now();
    this.incidents = this.incidents.filter((i) => Date.parse(i.resolvedAt || iso(now)) >= now - KEEP_MS).slice(-1000);
    try {
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, since: this.since, heartbeat: now, incidents: this.incidents }));
      renameSync(tmp, this.file);
      return true;
    } catch {
      return false;
    }
  }

  // ── What the rest of the app reports ──────────────────────────────────────────────────

  /** A finished round of checks. `failed` holds the names of status pages that did not answer. */
  recordCycle({ total, failed, durationMs }) {
    this.cycle = { at: this.now(), total, failed, durationMs };
  }

  recordRequest(rejected) {
    this.pending[rejected ? 'rejected' : 'served']++;
  }

  recordLoopDelay(ms) {
    this.loopDelayMs = ms;
  }

  // ── Conditions ────────────────────────────────────────────────────────────────────────

  trafficInWindow() {
    let served = 0;
    let rejected = 0;
    for (const [, s, r] of this.traffic) {
      served += s;
      rejected += r;
    }
    return { served, rejected };
  }

  /** Each condition: how bad it is right now (0-3) and how to describe it. */
  conditions() {
    const now = this.now();
    const out = {};

    const c = this.cycle;
    const share = c && c.total ? c.failed.length / c.total : 0;
    const names = c ? `${c.failed.slice(0, 8).join(', ')}${c.failed.length > 8 ? ` and ${c.failed.length - 8} more` : ''}` : '';
    out.collection = {
      level: share >= 0.6 ? 3 : share >= 0.2 ? 2 : share >= 0.05 ? 1 : 0,
      name: 'Cannot read some status pages',
      component: 'Status collection',
      openAfter: 1,
      closeAfter: 1,
      detail: c ? `${c.failed.length} of ${c.total} status pages did not answer in the last round: ${names}. Their status is shown as last known, or as unreachable.` : '',
      resolved: c ? `Status pages are answering again: ${c.total - c.failed.length} of ${c.total} read in the last round.` : '',
    };

    const age = now - (c ? c.at : this.bootedAt);
    out.freshness = {
      level: age > 10 * this.pollIntervalMs ? 2 : age > 3 * this.pollIntervalMs ? 1 : 0,
      name: 'Status data is out of date',
      component: 'Data freshness',
      openAfter: 1,
      closeAfter: 1,
      detail: `The last full round of checks finished ${span(age)} ago. One is due every ${span(this.pollIntervalMs)}.`,
      resolved: 'A full round of checks has finished. Data is current again.',
    };

    const { served, rejected } = this.trafficInWindow();
    const active = this.open('traffic');
    out.traffic = {
      level: rejected >= 300 ? 1 : active && rejected >= 30 ? 1 : 0,
      name: 'Unusual traffic',
      component: 'Traffic',
      openAfter: 1,
      closeAfter: 4,
      detail: `Turned away ${rejected.toLocaleString('en-US')} requests in the last minute and served ${served.toLocaleString('en-US')}. Somebody is checking whether the status page of the internet can be taken down. Rate limiting is holding.`,
      resolved: 'Traffic is back to normal.',
    };

    out.slow = {
      level: this.loopDelayMs >= 1000 ? 2 : this.loopDelayMs >= 250 ? 1 : 0,
      name: 'Slow responses',
      component: 'Website',
      openAfter: 2,
      closeAfter: 2,
      detail: `The server is struggling to keep up: requests waited up to ${Math.round(this.loopDelayMs)} ms before being handled.`,
      resolved: 'Response times are back to normal.',
    };
    return out;
  }

  open(key) {
    return this.incidents.find((i) => i.key === key && !i.resolvedAt);
  }

  close(incident, at, body) {
    incident.resolvedAt = iso(at);
    incident.updatedAt = iso(at);
    incident.status = 'Resolved';
    incident.updates = [{ at: iso(at), status: 'Resolved', body }, ...incident.updates].slice(0, 8);
  }

  /** Re-evaluate every condition, open or close incidents, and write the heartbeat. Call every few seconds. */
  tick() {
    const now = this.now();
    this.traffic.push([now, this.pending.served, this.pending.rejected]);
    this.pending = { served: 0, rejected: 0 };
    this.traffic = this.traffic.filter(([at]) => now - at < TRAFFIC_WINDOW_MS);

    this.levels = {};
    for (const [key, cond] of Object.entries(this.conditions())) {
      const streak = (this.streaks[key] ??= { bad: 0, good: 0 });
      streak.bad = cond.level > 0 ? streak.bad + 1 : 0;
      streak.good = cond.level > 0 ? 0 : streak.good + 1;
      const active = this.open(key);
      this.levels[cond.component] = Math.max(this.levels[cond.component] ?? 0, active || streak.bad >= cond.openAfter ? cond.level : 0);

      if (!active && streak.bad >= cond.openAfter) {
        this.incidents.push({
          id: `${key}:${now}`,
          key,
          name: cond.name,
          impact: IMPACT[cond.level],
          status: 'Ongoing',
          startedAt: iso(now),
          resolvedAt: null,
          updatedAt: iso(now),
          url: null,
          updates: [{ at: iso(now), status: 'Detected', body: cond.detail }],
        });
      } else if (active && streak.good >= cond.closeAfter) {
        this.close(active, now, cond.resolved);
      } else if (active && cond.level > 0) {
        // Keep the latest numbers on top, and remember the worst it got.
        const worse = cond.level > IMPACT.indexOf(active.impact);
        if (worse) active.impact = IMPACT[cond.level];
        const latest = active.updates[0];
        if (worse || latest.status === 'Detected') {
          active.updates = [{ at: iso(now), status: worse ? 'Worse' : 'Ongoing', body: cond.detail }, ...active.updates].slice(0, 8);
        } else {
          active.updates[0] = { at: iso(now), status: 'Ongoing', body: cond.detail };
        }
        active.updatedAt = iso(now);
      }
    }
    this.persistent = this.save();
    return this.snapshot();
  }

  /** The same shape every adapter returns. */
  snapshot() {
    const now = this.now();
    const open = this.incidents.filter((i) => !i.resolvedAt);
    const levels = this.levels || {};
    const status = (name) => ['operational', 'degraded', 'partial_outage', 'major_outage'][levels[name] ?? 0];
    const c = this.cycle;
    const { served } = this.trafficInWindow();
    const facts = [
      c ? `Read ${c.total - c.failed.length} of ${c.total} status pages in ${span(c.durationMs)}` : 'First round of checks in progress',
      `${served.toLocaleString('en-US')} requests in the last minute`,
      `running for ${span(now - this.bootedAt)}`,
    ];
    return {
      status: worstStatus(open.map((i) => impactToStatus(i.impact))),
      description: `${facts.join(' · ')}.`,
      incidents: open.map((i) => ({ ...i })),
      history: this.incidents.map((i) => ({ ...i })),
      coverageStart: iso(this.since),
      ...components(['Website', 'Status collection', 'Data freshness', 'Traffic'].map((name) => ({ name, status: status(name) }))),
    };
  }
}
