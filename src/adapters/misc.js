/** Adapters for providers with a format of their own. */
import { components, incident, impactToStatus, worstStatus, clip, plainText } from '../normalize.js';

// ── Microsoft Azure: RSS feed that lists open incidents; empty when all is well ─────────
export function parseAzure(xml) {
  if (!/<rss[\s>]/i.test(xml)) throw new Error('not an RSS feed');
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : '';
  };
  const incidents = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([item]) =>
    incident({
      id: tag(item, 'guid') || tag(item, 'title'),
      name: tag(item, 'title'),
      impact: 'major',
      status: 'Ongoing',
      startedAt: tag(item, 'pubDate'),
      url: tag(item, 'link').trim() || 'https://azure.status.microsoft/en-us/status',
      updates: [{ at: tag(item, 'pubDate'), status: '', body: tag(item, 'description') }],
    }),
  );
  return { status: worstStatus(incidents.map((i) => impactToStatus(i.impact))), description: '', incidents };
}

// ── Microsoft 365: one entry per consumer service ───────────────────────────────────────
function m365Status(value) {
  const s = String(value || '').toLowerCase();
  if (!s || s === 'operational' || s.includes('restored') || s.includes('false positive')) return 'operational';
  if (/interrupt|outage|down|unavailable/.test(s)) return 'partial_outage';
  return 'degraded';
}

export function parseM365(json) {
  if (!Array.isArray(json) || !json.length) throw new Error('not a Microsoft 365 status list');
  const services = json.map((s) => ({ name: s.ServiceDisplayName, status: m365Status(s.Status), raw: s }));
  const incidents = services
    .filter((s) => s.status !== 'operational')
    .map((s) =>
      incident({
        id: s.raw.Id || s.name,
        name: s.raw.Title ? `${s.name}: ${s.raw.Title}` : `${s.name}: ${s.raw.Status}`,
        impact: s.status === 'partial_outage' ? 'major' : 'minor',
        status: s.raw.Status,
        startedAt: /^0001/.test(String(s.raw.AuthoredDateTime)) ? s.raw.LastUpdatedTime : s.raw.AuthoredDateTime,
        updatedAt: s.raw.LastUpdatedTime,
        url: 'https://status.cloud.microsoft',
        updates: s.raw.Message ? [{ at: s.raw.LastUpdatedTime, status: s.raw.Status, body: s.raw.Message }] : [],
      }),
    );
  return { status: worstStatus(services.map((s) => s.status)), description: '', incidents, ...components(services) };
}

// ── Apple: system status JSON (the developer feed is wrapped in a JSONP callback) ───────
const APPLE_IMPACT = { outage: 'major', issue: 'minor', performance: 'minor', maintenance: 'maintenance' };

export function parseApple(text, pageUrl) {
  const body = String(text).trim().replace(/^[\w$.]+\(/, '').replace(/\);?$/, '');
  const json = JSON.parse(body);
  if (!Array.isArray(json?.services)) throw new Error('not an Apple system status document');

  const byEvent = new Map();
  const services = [];
  for (const service of json.services) {
    let status = 'operational';
    for (const e of service.events || []) {
      const state = String(e.eventStatus || '').toLowerCase();
      if (state === 'upcoming') continue;
      const impact = APPLE_IMPACT[String(e.statusType || '').toLowerCase()] ?? 'minor';
      const open = state === 'ongoing' || (!e.epochEndDate && state !== 'resolved' && state !== 'completed');
      if (open) status = worstStatus([status, impactToStatus(impact)]);
      const key = e.messageId || `${e.epochStartDate}:${e.message}`;
      const entry = byEvent.get(key) || { e, impact, open, names: [] };
      entry.names.push(service.serviceName);
      byEvent.set(key, entry);
    }
    services.push({ name: service.serviceName, status });
  }

  const history = [...byEvent.entries()].map(([key, { e, impact, open, names }]) =>
    incident({
      id: key,
      name: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}: ${e.statusType || 'Issue'}`,
      impact,
      status: open ? 'Ongoing' : 'Resolved',
      startedAt: e.epochStartDate,
      resolvedAt: open ? null : e.epochEndDate || e.epochStartDate,
      url: pageUrl,
      updates: [{ at: e.epochEndDate || e.epochStartDate, status: e.usersAffected, body: e.message }],
    }),
  );
  const oldest = history.reduce((min, i) => (i.startedAt && i.startedAt < min ? i.startedAt : min), new Date().toISOString());
  return {
    status: worstStatus(services.map((s) => s.status)),
    description: '',
    incidents: history.filter((i) => !i.resolvedAt),
    history,
    coverageStart: oldest, // Apple only lists the last few days
    ...components(services),
  };
}

// ── Slack ───────────────────────────────────────────────────────────────────────────────
const SLACK_IMPACT = { outage: 'critical', incident: 'minor', notice: 'none', maintenance: 'maintenance' };

function slackIncident(raw) {
  const resolved = ['resolved', 'completed', 'cancelled'].includes(String(raw.status).toLowerCase());
  return incident({
    id: raw.id,
    name: raw.title,
    impact: SLACK_IMPACT[raw.type] ?? 'minor',
    status: raw.status,
    startedAt: raw.date_created,
    resolvedAt: resolved ? raw.date_updated : null,
    updatedAt: raw.date_updated,
    url: raw.url,
    updates: (raw.notes || []).map((n) => ({ at: n.date_created, status: '', body: n.body })),
  });
}

export function parseSlackCurrent(json) {
  if (!json || typeof json.status !== 'string') throw new Error('not a Slack status document');
  const incidents = (json.active_incidents || []).map(slackIncident).filter((i) => !i.resolvedAt);
  const status = worstStatus(incidents.map((i) => impactToStatus(i.impact)));
  return { status: status === 'operational' && json.status !== 'ok' && incidents.length ? 'degraded' : status, description: '', incidents };
}

export function parseSlackHistory(json) {
  if (!Array.isArray(json)) throw new Error('not a Slack history list');
  const history = json.map(slackIncident).filter((i) => i.startedAt);
  const oldest = history.reduce((min, i) => (i.startedAt < min ? i.startedAt : min), history[0]?.startedAt ?? null);
  return { history, coverageStart: oldest };
}

// ── Heroku ──────────────────────────────────────────────────────────────────────────────
const HEROKU = { green: 'operational', yellow: 'degraded', red: 'major_outage', blue: 'maintenance' };

export function parseHeroku(json) {
  if (!Array.isArray(json?.status)) throw new Error('not a Heroku status document');
  const systems = json.status.map((s) => ({ name: s.system, status: HEROKU[s.status] ?? 'degraded' }));
  const worst = worstStatus(systems.map((s) => s.status));
  const incidents = (json.incidents || []).map((i) =>
    incident({
      id: i.id,
      name: i.title,
      impact: worst === 'major_outage' ? 'critical' : 'minor',
      status: i.state || 'Ongoing',
      startedAt: i.created_at,
      updatedAt: i.updated_at,
      url: i.full_url,
      updates: (i.updates || []).map((u) => ({ at: u.created_at, status: u.title || u.update_type, body: u.contents })),
    }),
  );
  return { status: worst === 'operational' && incidents.length ? 'degraded' : worst, description: '', incidents, ...components(systems) };
}

// ── Status.io (GitLab) ──────────────────────────────────────────────────────────────────
function statusioCode(code) {
  if (code >= 500) return 'major_outage';
  if (code >= 400) return 'partial_outage';
  if (code >= 300) return 'degraded';
  if (code >= 200) return 'maintenance';
  return 'operational';
}

export function parseStatusio(json, pageUrl) {
  const result = json?.result;
  if (!result?.status_overall) throw new Error('not a Status.io document');
  const status = statusioCode(Number(result.status_overall.status_code));
  const incidents = (result.incidents || []).map((i) => {
    const messages = [...(i.messages || [])].sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
    return incident({
      id: i._id || i.name,
      name: i.name,
      impact: status === 'major_outage' ? 'critical' : status === 'partial_outage' ? 'major' : 'minor',
      status: 'Ongoing',
      startedAt: i.datetime_open || messages.at(-1)?.datetime,
      updatedAt: messages[0]?.datetime,
      url: pageUrl,
      updates: messages.map((m) => ({ at: m.datetime, status: '', body: m.details })),
    });
  });
  const list = (result.status || []).map((c) => ({ name: c.name, status: statusioCode(Number(c.status_code)) }));
  return { status, description: clip(plainText(result.status_overall.status), 160), incidents, ...components(list) };
}

// ── Oracle Cloud: a Statuspage-style status.json without the rest of the API ───────────
const INDICATOR = { none: 'operational', minor: 'degraded', major: 'partial_outage', critical: 'major_outage', maintenance: 'maintenance' };

export function parseOci(json) {
  const indicator = json?.status?.indicator;
  if (!(indicator in INDICATOR)) throw new Error('not an OCI status document');
  return { status: INDICATOR[indicator], description: clip(plainText(json.status.description), 160), incidents: [] };
}

// ── Fastly: a single overall status word ────────────────────────────────────────────────
export function parseFastly(json) {
  const word = String(json?.Status ?? '');
  if (!word) throw new Error('not a Fastly status document');
  const s = word.toLowerCase();
  let status = 'degraded';
  if (/normal|operational|available|healthy/.test(s)) status = 'operational';
  else if (/maint/.test(s)) status = 'maintenance';
  else if (/outage|disrupt|unavailable|down/.test(s)) status = 'partial_outage';
  return { status, description: clip(plainText(json.StatusText || word), 160), incidents: [] };
}

// ── PlayStation Network (Americas region) ───────────────────────────────────────────────
export function parsePsn(json) {
  if (!json || !Array.isArray(json.countries)) throw new Error('not a PSN status document');
  const open = [...(json.status || []), ...json.countries.flatMap((c) => c.status || [])];
  const seen = new Set();
  const incidents = [];
  for (const s of open) {
    const key = s.statusId || s.message?.messageKey || JSON.stringify(s).slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    incidents.push(
      incident({
        id: key,
        name: s.message?.messages?.['en-US'] || s.statusType || 'Service issue',
        impact: /outage/i.test(String(s.statusType)) ? 'major' : 'minor',
        status: 'Ongoing',
        startedAt: s.startDate || Date.now(),
        url: 'https://status.playstation.com',
      }),
    );
  }
  return { status: worstStatus(incidents.map((i) => impactToStatus(i.impact))), description: '', incidents };
}

export const azure = {
  current: async (_p, { getText }) => parseAzure(await getText('https://azure.status.microsoft/en-us/status/feed/')),
};
export const m365 = {
  current: async (_p, { getJson }) => parseM365(await getJson('https://status.cloud.microsoft/api/posts/m365Consumer')),
};
export const apple = {
  current: async (p, { getText }) => parseApple(await getText(p.feed), p.page),
};
export const slack = {
  current: async (_p, { getJson }) => parseSlackCurrent(await getJson('https://slack-status.com/api/v2.0.0/current')),
  slow: async (_p, { getJson }) => parseSlackHistory(await getJson('https://slack-status.com/api/v2.0.0/history')),
};
export const heroku = {
  current: async (_p, { getJson }) => parseHeroku(await getJson('https://status.heroku.com/api/v4/current-status')),
};
export const statusio = {
  current: async (p, { getJson }) => parseStatusio(await getJson(`${p.base}/1.0/status/${p.statusioId}`), p.page),
};
export const oci = {
  current: async (_p, { getJson }) => parseOci(await getJson('https://ocistatus.oraclecloud.com/api/v2/status.json')),
};
export const fastly = {
  current: async (_p, { getJson }) => parseFastly(await getJson('https://www.fastlystatus.com/status.json')),
};
export const psn = {
  current: async (_p, { getJson }) => parsePsn(await getJson('https://status.playstation.com/data/statuses/region/SCEA.json')),
};
