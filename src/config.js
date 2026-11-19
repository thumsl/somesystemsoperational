const env = process.env;

export const BRAND = env.BRAND_NAME || 'Some Systems Operational';
export const TAGLINE = env.BRAND_TAGLINE || "The internet's status page";
export const PORT = Number(env.PORT || 3000);
/** Public origin of this site, without a trailing slash. Used for canonical links and the bot user agent. */
export const PUBLIC_URL = (env.PUBLIC_URL || '').replace(/\/+$/, '');

export const POLL_INTERVAL_MS = Number(env.POLL_INTERVAL_MS || 120_000);
export const HISTORY_INTERVAL_MS = Number(env.HISTORY_INTERVAL_MS || 20 * 60_000);
export const CONCURRENCY = Number(env.POLL_CONCURRENCY || 12);
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_BODY_BYTES = 12 * 1024 * 1024;
export const HISTORY_DAYS = 90;
/** After this many failed polls in a row a provider is shown as "unknown" instead of its last known status. */
export const MAX_FAILURES = 3;

export const USER_AGENT =
  `Mozilla/5.0 (compatible; SomeSystemsOperationalBot/1.0; status page aggregator${PUBLIC_URL ? `; +${PUBLIC_URL}` : ''})`;
