import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { BRAND, PORT, PUBLIC_URL } from './config.js';
import { Monitor } from './monitor.js';
import { CATEGORIES, PROVIDERS, PROVIDERS_BY_SLUG } from './providers.js';
import { renderDetail, renderFavicon, renderHome, renderNotFound, setAssetVersion } from './render.js';
import { buildSummary } from './summary.js';

const asset = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url));
const ASSETS = {
  '/assets/style.css': { body: asset('style.css'), type: 'text/css; charset=utf-8' },
  '/assets/app.js': { body: asset('app.js'), type: 'text/javascript; charset=utf-8' },
};
setAssetVersion(
  createHash('sha256')
    .update(Buffer.concat(Object.values(ASSETS).map((a) => a.body)))
    .digest('hex')
    .slice(0, 10),
);

const monitor = new Monitor(PROVIDERS);

// Rendering 250 services is cheap but not free; reuse the result until the data changes.
const cache = new Map();
function cached(key, build) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && (hit.version === monitor.version || now - hit.at < 5_000)) return hit.value;
  const value = build();
  cache.set(key, { version: monitor.version, at: now, value });
  return value;
}
const summary = () => cached('summary', () => buildSummary(monitor.all(), Date.now()));

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function send(req, res, status, type, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'content-length': buffer.length, ...SECURITY_HEADERS, ...headers });
  res.end(req.method === 'HEAD' ? undefined : buffer);
}
const html = (req, res, status, body) => send(req, res, status, 'text/html; charset=utf-8', body, { 'cache-control': 'public, max-age=15' });
const json = (req, res, body) =>
  send(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(body), { 'cache-control': 'public, max-age=30', 'access-control-allow-origin': '*' });

// The API speaks the Statuspage dialect, so anything that can read a status page can read this one.
const API_STATUS = { operational: 'operational', degraded: 'degraded_performance', partial_outage: 'partial_outage', major_outage: 'major_outage', maintenance: 'under_maintenance', unknown: 'unknown', pending: 'unknown' };
const API_INDICATOR = { ok: 'none', warn: 'minor', bad: 'major', pending: 'none' };
const CATEGORY_NAME = new Map(CATEGORIES);

function apiStatus(s) {
  return {
    page: { id: 'internet', name: BRAND, url: PUBLIC_URL || null, updated_at: s.checkedAt ? new Date(s.checkedAt).toISOString() : null },
    status: { indicator: API_INDICATOR[s.headline.level], description: s.headline.title },
  };
}

function apiSummary(s) {
  return {
    ...apiStatus(s),
    counts: { total: s.total, ...s.counts },
    components: monitor.all().map((state) => ({
      id: state.provider.slug,
      name: state.provider.name,
      status: API_STATUS[state.status],
      group: CATEGORY_NAME.get(state.provider.category),
      source: state.provider.page,
      active_incidents: state.incidents.length,
      updated_at: state.okAt ? new Date(state.okAt).toISOString() : null,
    })),
    incidents: s.incidents.map(({ state, incident }) => ({
      id: `${state.provider.slug}:${incident.id}`,
      component_id: state.provider.slug,
      name: incident.name,
      status: incident.status.toLowerCase(),
      impact: incident.impact,
      started_at: incident.startedAt,
      updated_at: incident.updatedAt,
      shortlink: incident.url,
    })),
  };
}

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(req, res, 400, 'text/plain; charset=utf-8', 'Bad request');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, 'text/plain; charset=utf-8', 'Method not allowed', { allow: 'GET, HEAD' });
  }

  if (path === '/health') {
    // Report healthy only once there is something to show, so a deploy never swaps in an empty page.
    const ready = monitor.warm || Date.now() - monitor.startedAt > 90_000;
    return send(req, res, ready ? 200 : 503, 'text/plain; charset=utf-8', ready ? 'ok' : 'warming up', { 'cache-control': 'no-store' });
  }
  if (ASSETS[path]) return send(req, res, 200, ASSETS[path].type, ASSETS[path].body, { 'cache-control': 'public, max-age=31536000, immutable' });
  if (path === '/favicon.svg' || path === '/favicon.ico') {
    const level = new URL(req.url, 'http://localhost').searchParams.get('s') || summary().headline.level;
    return send(req, res, 200, 'image/svg+xml', renderFavicon(level), { 'cache-control': 'public, max-age=300' });
  }
  if (path === '/robots.txt') return send(req, res, 200, 'text/plain; charset=utf-8', 'User-agent: *\nAllow: /\n', { 'cache-control': 'public, max-age=86400' });
  if (path === '/api/v2/summary.json') return json(req, res, apiSummary(summary()));
  if (path === '/api/v2/status.json') return json(req, res, apiStatus(summary()));
  if (path === '/') return html(req, res, 200, cached('home', () => renderHome(summary())));

  const slug = path.slice(1).replace(/\/$/, '');
  if (PROVIDERS_BY_SLUG.has(slug)) return html(req, res, 200, cached(`detail:${slug}`, () => renderDetail(monitor.get(slug), summary())));
  return html(req, res, 404, renderNotFound(summary()));
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[web] ${BRAND} listening on :${PORT}, tracking ${PROVIDERS.length} services`);
  monitor.start();
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    monitor.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
