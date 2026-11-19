export const STATUS_RANK = { operational: 0, maintenance: 0, degraded: 1, partial_outage: 2, major_outage: 3 };
export const IMPACT_RANK = { none: 0, maintenance: 0, minor: 1, major: 2, critical: 3 };
const RANK_TO_STATUS = ['operational', 'degraded', 'partial_outage', 'major_outage'];

export const isImpact = (value) => Object.hasOwn(IMPACT_RANK, value);
export const impactToStatus = (impact) =>
  impact === 'maintenance' ? 'maintenance' : RANK_TO_STATUS[IMPACT_RANK[impact] ?? 0];

export function worstStatus(statuses) {
  let rank = 0;
  let maintenance = false;
  for (const s of statuses) {
    if (s === 'maintenance') maintenance = true;
    rank = Math.max(rank, STATUS_RANK[s] ?? 0);
  }
  if (rank > 0) return RANK_TO_STATUS[rank];
  return maintenance ? 'maintenance' : 'operational';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function plainText(input) {
  if (input == null) return '';
  return String(input)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeCodePoint(n) {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

export function clip(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function humanize(value) {
  const s = String(value ?? '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export function toIso(value) {
  if (value == null || value === '') return null;
  let d;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    d = new Date(value);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function safeUrl(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : fallback;
  } catch {
    return fallback;
  }
}

export function incident({ id, name, impact, status, startedAt, resolvedAt = null, updatedAt = null, url = null, updates = [] }) {
  return {
    id: String(id ?? `${name}:${startedAt}`),
    name: clip(plainText(name) || 'Incident', 220),
    impact: isImpact(impact) ? impact : 'minor',
    status: clip(humanize(status), 40),
    startedAt: toIso(startedAt),
    resolvedAt: toIso(resolvedAt),
    updatedAt: toIso(updatedAt),
    url: safeUrl(url),
    updates: updates
      .slice(0, 8)
      .map((u) => ({ at: toIso(u.at), status: clip(humanize(u.status), 40), body: clip(plainText(u.body), 1500) }))
      .filter((u) => u.body || u.status),
  };
}

const MAX_COMPONENTS = 60;

export function components(all) {
  const clean = all
    .filter((c) => c && c.name)
    .map((c) => ({ name: clip(plainText(c.name), 120), status: Object.hasOwn(STATUS_RANK, c.status) ? c.status : 'operational', group: c.group ? clip(plainText(c.group), 120) : null }));
  const issues = clean.filter((c) => c.status !== 'operational');
  const truncated = clean.length > MAX_COMPONENTS;
  return {
    components: truncated ? issues.slice(0, MAX_COMPONENTS) : clean,
    componentCount: clean.length,
    componentIssues: issues.length,
    componentsTruncated: truncated,
  };
}
