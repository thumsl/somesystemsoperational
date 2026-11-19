import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { BRAND, CLIENT_IP_HEADER, DATA_DIR, INDEXNOW_KEY, POLL_INTERVAL_MS, PORT, PUBLIC_URL, RATE_LIMIT_BURST, RATE_LIMIT_PER_SEC, SELF_SLUG, UMAMI_SCRIPT } from './config.js';
import { feed, llms, sitemap } from './feeds.js';
import * as fetcher from './fetcher.js';
import { changed } from './indexnow.js';
import { Monitor } from './monitor.js';
import { CATEGORIES, CATEGORY_SLUG, PROVIDERS, PROVIDERS_BY_SLUG } from './providers.js';
import { renderAbout, renderApi } from './pages.js';
import { bucketKey, clientIp, isLoopback, RateLimiter } from './ratelimit.js';
import { renderCategory, renderDetail, renderFavicon, renderHome, renderNotFound, setAssetVersion } from './render.js';
import { SelfMonitor } from './self.js';
import { buildSummary } from './summary.js';

const STATS = UMAMI_SCRIPT ? ` ${new URL(UMAMI_SCRIPT).origin}` : '';
const SECURITY_HEADERS = {
  'content-security-policy': `default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'${STATS}; img-src 'self' data:; connect-src 'self'${STATS}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};
const PAGE_CACHE = 'public, max-age=15, s-maxage=30, stale-while-revalidate=120, stale-if-error=86400';
const API_CACHE = 'public, max-age=30, stale-while-revalidate=120, stale-if-error=86400';
const FOREVER = 'public, max-age=31536000, immutable';

function pack(type, body, cacheControl, extra = {}) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const compress = raw.length > 1024 && !/^(font|image\/png)/.test(type);
  return {
    raw,
    gzip: compress ? gzipSync(raw, { level: 6 }) : null,
    br: compress ? brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5, [zlib.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : null,
    etag: `W/"${createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`,
    headers: { 'content-type': type, 'cache-control': cacheControl, vary: 'accept-encoding', ...SECURITY_HEADERS, ...extra },
  };
}

function respond(req, res, status, entry) {
  const headers = { ...entry.headers, etag: entry.etag };
  if (status === 200 && req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const accepts = String(req.headers['accept-encoding'] || '');
  let body = entry.raw;
  if (entry.br && /\bbr\b/.test(accepts)) {
    body = entry.br;
    headers['content-encoding'] = 'br';
  } else if (entry.gzip && /\bgzip\b/.test(accepts)) {
    body = entry.gzip;
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function redirect(res, location) {
  res.writeHead(301, { location, 'cache-control': 'public, max-age=3600', 'content-length': 0 });
  res.end();
}

function plain(req, res, status, text, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(req.method === 'HEAD' ? undefined : text);
}

const file = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url));
const css = file('style.css');
const js = file('app.js');
const font = file('instrument-sans.woff2');
const ASSET_VERSION = createHash('sha256').update(Buffer.concat([css, js, font])).digest('hex').slice(0, 10);
setAssetVersion(ASSET_VERSION);
const STATIC = new Map([
  [`/assets/${ASSET_VERSION}/style.css`, pack('text/css; charset=utf-8', css, FOREVER)],
  [`/assets/${ASSET_VERSION}/app.js`, pack('text/javascript; charset=utf-8', js, FOREVER)],
  [`/assets/${ASSET_VERSION}/instrument-sans.woff2`, pack('font/woff2', font, FOREVER)],
  ['/og.png', pack('image/png', file('og.png'), 'public, max-age=86400')],
  ['/robots.txt', pack('text/plain; charset=utf-8', `User-agent: *\nAllow: /\n${PUBLIC_URL ? `\nSitemap: ${PUBLIC_URL}/sitemap.xml\n` : ''}`, 'public, max-age=86400')],
]);
if (INDEXNOW_KEY) STATIC.set(`/${INDEXNOW_KEY}.txt`, pack('text/plain; charset=utf-8', INDEXNOW_KEY, 'public, max-age=86400'));
for (const level of ['ok', 'warn', 'partial', 'bad', 'maint', 'pending']) {
  STATIC.set(`/favicon-${level}.svg`, pack('image/svg+xml', renderFavicon(level), 'public, max-age=604800'));
}

const self = new SelfMonitor({ file: DATA_DIR ? `${DATA_DIR.replace(/\/+$/, '')}/self.json` : null, pollIntervalMs: POLL_INTERVAL_MS });
const monitor = new Monitor(PROVIDERS, {
  ctx: { ...fetcher, now: () => Date.now(), self: () => self.snapshot() },
  onCycle: (cycle) => self.recordCycle(cycle),
  onChange: (provider) => changed('/', `/${provider.slug}`, `/status/${CATEGORY_SLUG.get(provider.category)}`),
});
const limiter = new RateLimiter({ capacity: RATE_LIMIT_BURST, refillPerSec: RATE_LIMIT_PER_SEC });

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
setInterval(() => {
  self.recordLoopDelay(loopDelay.max / 1e6);
  loopDelay.reset();
  monitor.apply(SELF_SLUG, self.tick());
  limiter.prune();
}, 15_000).unref();

const memo = new Map();
function cached(key, build) {
  const hit = memo.get(key);
  const now = Date.now();
  if (hit && (hit.version === monitor.version || now - hit.at < 5_000)) return hit.value;
  const value = build();
  memo.set(key, { version: monitor.version, at: now, value });
  return value;
}
const summary = () => cached('summary', () => buildSummary(monitor.all(), Date.now()));
const page = (key, render) => cached(key, () => pack('text/html; charset=utf-8', render(), PAGE_CACHE));
const doc = (key, type, build) => cached(key, () => pack(type, build(), API_CACHE));
const api = (key, build) => cached(key, () => pack('application/json; charset=utf-8', JSON.stringify(build()), API_CACHE, { 'access-control-allow-origin': '*' }));

const API_STATUS = { operational: 'operational', degraded: 'degraded_performance', partial_outage: 'partial_outage', major_outage: 'major_outage', maintenance: 'under_maintenance', unknown: 'unknown', pending: 'unknown' };
const API_INDICATOR = { ok: 'none', warn: 'minor', bad: 'major', pending: 'none' };
const CATEGORY_NAME = new Map(CATEGORIES);
const HOST = PUBLIC_URL ? new URL(PUBLIC_URL).host : '';

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
      source: state.provider.self ? PUBLIC_URL || null : state.provider.page,
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

function handle(req, res) {
  const ip = clientIp(req, CLIENT_IP_HEADER);
  const url = req.url || '/';
  const path = url.split('?', 1)[0];

  if (path === '/health') {
    // unhealthy until the first round is in, otherwise a deploy swaps in an empty page
    const ready = monitor.warm || Date.now() - monitor.startedAt > 90_000;
    return plain(req, res, ready ? 200 : 503, ready ? 'ok' : 'warming up');
  }

  if (!isLoopback(ip)) {
    const key = bucketKey(ip);
    if (!limiter.take(key)) {
      self.recordRequest(true);
      return plain(req, res, 429, 'Too many requests. Even this page has limits.\n', { 'retry-after': String(limiter.retryAfter(key)) });
    }
  }
  self.recordRequest(false);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return plain(req, res, 405, 'Method not allowed\n', { allow: 'GET, HEAD', connection: 'close' });
  }
  if (url.length > 2048) return plain(req, res, 414, 'URI too long\n');

  const host = String(req.headers.host || '').toLowerCase();
  if (HOST && host && host !== HOST && !isLoopback(ip)) return redirect(res, PUBLIC_URL + url);
  const tidy = `/${path.split('/').filter(Boolean).join('/')}`;
  if (tidy !== path) return redirect(res, tidy + url.slice(path.length));

  const fixed = STATIC.get(path);
  if (fixed) return respond(req, res, 200, fixed);
  if (path === '/') return respond(req, res, 200, page('home', () => renderHome(summary())));
  if (path === '/api/v2/summary.json') return respond(req, res, 200, api('api:summary', () => apiSummary(summary())));
  if (path === '/api/v2/status.json') return respond(req, res, 200, api('api:status', () => apiStatus(summary())));
  if (path === '/favicon.ico' || path === '/favicon.svg') return respond(req, res, 200, STATIC.get(`/favicon-${summary().headline.level}.svg`));

  if (path === '/about') return respond(req, res, 200, page('about', () => renderAbout(summary())));
  if (path === '/api') return respond(req, res, 200, page('api', () => renderApi(summary())));
  if (path === '/sitemap.xml') return respond(req, res, 200, doc('sitemap', 'application/xml; charset=utf-8', () => sitemap(summary())));
  if (path === '/feed.xml') return respond(req, res, 200, doc('feed', 'application/atom+xml; charset=utf-8', () => feed(monitor.all(), Date.now())));
  if (path === '/llms.txt') return respond(req, res, 200, doc('llms', 'text/plain; charset=utf-8', () => llms(summary())));

  if (path.startsWith('/status/')) {
    const category = summary().categories.find((c) => c.slug === path.slice(8));
    if (category) return respond(req, res, 200, page(`category:${category.key}`, () => renderCategory(category, summary())));
  }
  const alias = /^\/is-(.+)-down$/.exec(path);
  if (alias && PROVIDERS_BY_SLUG.has(alias[1])) return redirect(res, `/${alias[1]}`);

  const slug = path.slice(1);
  if (PROVIDERS_BY_SLUG.has(slug)) return respond(req, res, 200, page(`detail:${slug}`, () => renderDetail(monitor.get(slug), summary())));
  return respond(req, res, 404, page('404', () => renderNotFound(summary())));
}

const server = createServer(
  {
    maxHeaderSize: 8 * 1024,
    headersTimeout: 8_000,
    requestTimeout: 15_000,
    keepAliveTimeout: 10_000,
    connectionsCheckingInterval: 5_000,
  },
  (req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error('[web] request failed', err);
      if (!res.headersSent) plain(req, res, 500, 'Internal error. Yes, really.\n');
      else res.destroy();
    }
  },
);
server.on('clientError', (_err, socket) => socket.destroy());

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[web] ${BRAND} listening on :${PORT}, tracking ${PROVIDERS.length} services${self.persistent ? `, own history in ${DATA_DIR}` : ''}`);
  monitor.start();
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    monitor.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
