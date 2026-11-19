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
| `BRAND_NAME` | `Some Systems Operational` | Site name |
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
| `/api/v2/summary.json` | Everything, as JSON |
| `/api/v2/status.json` | Just the headline |
| `/health` | 200 once the first round of checks is done |

Not affiliated with any of the services listed.
