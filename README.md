# Some Systems Operational

One status page for the whole internet. It reads the public status pages of ~250 major
platforms (clouds, AI providers, developer tools, SaaS, payments, social) and shows them
on a single page, with per-service detail pages and a 90-day incident history.

Every status shown is what the provider itself reports. Nothing is probed or guessed.

## Run

```sh
npm start          # http://localhost:3000
npm test
```

No dependencies and no build step; needs Node 22 or newer. State lives in memory and is
rebuilt from the providers' own feeds within a minute of starting.

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `PUBLIC_URL` | (none) | Public origin, used for canonical links and in the bot user agent |
| `UMAMI_SCRIPT` | (none) | URL of an Umami `script.js`. Analytics stay off unless this and the id are set |
| `UMAMI_WEBSITE_ID` | (none) | Website id from Umami |
| `INDEXNOW_KEY` | (none) | Hex key for IndexNow. When set, search engines are told which pages changed whenever a status flips |
| `GOOGLE_SITE_VERIFICATION` | (none) | Token for the Search Console verification meta tag |
| `DONATE_BTC`, `DONATE_ETH` | the author's | Donation addresses in the footer. Set to an empty string to hide one |
| `BRAND_NAME` | `Some Systems Operational` | Site name |
| `DATA_DIR` | (none; `/data` in the image) | Where the site keeps its own incident history. Mount a volume to keep it across deploys |
| `CLIENT_IP_HEADER` | `x-forwarded-for` | Header with the visitor's address, used for rate limiting. Behind Cloudflare: `cf-connecting-ip` |
| `RATE_LIMIT_BURST` / `RATE_LIMIT_PER_SEC` | `90` / `1.5` | Requests one address may make in a burst, and per second after that |
| `POLL_INTERVAL_MS` | `120000` | How often every status page is read |
| `HISTORY_INTERVAL_MS` | `1200000` | How often incident history is refreshed |

## How it works

- `src/providers.js` is the catalog: one line per service, pointing at its status page.
- `src/adapters/` reads each status page format into one model. Most pages run on
  Atlassian Statuspage or incident.io (same API), Instatus or Better Stack; the giants
  (AWS, Google, Azure, Microsoft 365, Apple, Slack, …) each have their own format.
- `src/monitor.js` polls everything on a loop and keeps the latest state.
- `src/history.js` and `src/summary.js` turn incident lists into the day bars and the
  internet-wide numbers.
- `src/render.js` and `src/server.js` serve the pages, plus a Statuspage-style API at
  `/api/v2/summary.json` and `/api/v2/status.json`.

## It tracks itself

The site is one of the services it lists (`src/self.js`). That status is measured, not
claimed: it turns degraded when too many status pages cannot be read, when the data goes
stale, when the server is slow, or when rate limiting is turning away a flood. Those
incidents open and close on their own and are written to `DATA_DIR`. A gap in the
heartbeat kept there is recorded as downtime on the next start.

## Staying up

Every page is rendered at most once every few seconds, compressed once and served from
memory, so a request costs a map lookup. Each address gets a token bucket (429 beyond
it), query strings are ignored, and slow or oversized requests are dropped. That holds
against floods a single server can absorb. Against a real DDoS, put a CDN in front: the
cache headers already let one serve stale pages while the origin is unreachable, and no
URL on the site needs a query string, so the CDN can ignore them too.

## Adding a service

Find its status page, check which platform it runs on (`/api/v2/summary.json` answers on
Statuspage and incident.io, `/summary.json` on Instatus, `/index.json` on Better Stack)
and add a line to `src/providers.js`:

```js
sp('example', 'Example', 'dev', 'https://status.example.com');
```

## Routes

| Path | |
|---|---|
| `/` | The internet |
| `/<slug>` | One service: components, active incidents, history |
| `/status/<category>` | One category, e.g. `/status/developer-tools` |
| `/feed.xml` | Latest incidents everywhere, as an Atom feed |
| `/sitemap.xml`, `/llms.txt` | For crawlers |
| `/api/v2/summary.json` | Everything, as JSON |
| `/api/v2/status.json` | Just the headline |
| `/health` | 200 once the first round of checks is done |

Not affiliated with any of the services listed.
