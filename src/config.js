const env = process.env;

export const BRAND = env.BRAND_NAME || 'Some Systems Operational';
export const TAGLINE = env.BRAND_TAGLINE || "The internet's status page";
export const PORT = Number(env.PORT || 3000);
export const SELF_SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'this-page';
export const DATA_DIR = env.DATA_DIR || '';
export const CLIENT_IP_HEADER = (env.CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase();
export const RATE_LIMIT_BURST = Number(env.RATE_LIMIT_BURST || 90);
export const RATE_LIMIT_PER_SEC = Number(env.RATE_LIMIT_PER_SEC || 1.5);
export const PUBLIC_URL = (env.PUBLIC_URL || '').replace(/\/+$/, '');
export const UMAMI_SCRIPT = env.UMAMI_SCRIPT || '';
export const UMAMI_WEBSITE_ID = env.UMAMI_WEBSITE_ID || '';

export const POLL_INTERVAL_MS = Number(env.POLL_INTERVAL_MS || 120_000);
export const HISTORY_INTERVAL_MS = Number(env.HISTORY_INTERVAL_MS || 20 * 60_000);
export const CONCURRENCY = Number(env.POLL_CONCURRENCY || 12);
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_BODY_BYTES = 12 * 1024 * 1024;
export const HISTORY_DAYS = 90;
export const MAX_FAILURES = 3;

export const USER_AGENT =
  `Mozilla/5.0 (compatible; SomeSystemsOperationalBot/1.0; status page aggregator${PUBLIC_URL ? `; +${PUBLIC_URL}` : ''})`;
