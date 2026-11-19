import { BRAND, HISTORY_DAYS, PUBLIC_URL, RATE_LIMIT_PER_SEC, SELF_SLUG, UMAMI_SCRIPT } from './config.js';
import { crumbs, esc, layout } from './render.js';

const EXAMPLE = `{
  "page": { "id": "internet", "name": "Some Systems Operational", "updated_at": "2026-11-19T05:20:11.000Z" },
  "status": { "indicator": "minor", "description": "Some Systems Operational" },
  "counts": { "total": 253, "operational": 231, "degraded": 12, "partial_outage": 6, "major_outage": 1, "maintenance": 2, "unknown": 1, "pending": 0 },
  "components": [
    {
      "id": "github",
      "name": "GitHub",
      "status": "operational",
      "group": "Developer Tools",
      "source": "https://www.githubstatus.com",
      "active_incidents": 0,
      "updated_at": "2026-11-19T05:20:03.000Z"
    }
  ],
  "incidents": [
    {
      "id": "digitalocean:bdr1xgf08wsr",
      "component_id": "digitalocean",
      "name": "Increased Error Rates in SFO3",
      "status": "monitoring",
      "impact": "minor",
      "started_at": "2026-11-19T04:37:54.314Z",
      "updated_at": "2026-11-19T04:45:00.831Z",
      "shortlink": "https://stspg.io/bnb8ltd5ct7l"
    }
  ]
}`;

export function renderAbout(summary) {
  const categories = summary.categories.map((c) => `<a href="/status/${c.slug}">${esc(c.name)}</a>`).join(', ');
  const analytics = UMAMI_SCRIPT
    ? '<li>Page views are counted with Umami, an open source analytics tool running on our own server. It sets no cookies and does not store IP addresses.</li>'
    : '';
  const description = `${BRAND} reads the official status pages of ${summary.total} major internet services every two minutes and shows them on one page. How it works, what it tracks and what it knows about you.`;

  const body = `<main class="prose">
<a class="back" href="/">← All services</a>
<h1>About</h1>
<p>${esc(BRAND)} is one status page for the whole internet. It reads the official status pages of ${summary.total} services every two minutes and puts them on one screen, so when something breaks you can tell whether it is you, them, or everyone.</p>

<h2>How it works</h2>
<p>Every status here comes from the provider's own status page, or the feed behind it. Nothing is crowd-sourced and nobody's servers are being pinged. If a company has not admitted to a problem, it shows as operational here too. That is a limitation, and also the joke.</p>
<p>The history bars go back ${HISTORY_DAYS} days wherever a provider publishes its past incidents. Some do not, so their bars stay gray.</p>
<p>The site tracks itself the same way, on <a href="/${esc(SELF_SLUG)}">its own page</a>. Those incidents are measured, and they open and close automatically.</p>

<h2>What is tracked</h2>
<p>${summary.total} services across ${summary.categories.length} categories: ${categories}. To be listed, a service needs a public status page that a machine can read.</p>

<h2>For developers</h2>
<p>Everything on the site is available as JSON, with no key and no signup. See the <a href="/api">API</a>. There is also an <a href="/feed.xml">Atom feed</a> of every incident.</p>

<h2>Privacy</h2>
<ul>
<li>No accounts, no cookies, no ads.</li>
${analytics}
<li>The server sees your IP address, as any web server does, and uses it to limit how fast one visitor can send requests.</li>
<li>Nothing is sold or shared with anyone.</li>
</ul>

<h2>Fine print</h2>
<p>This is an unofficial project and is not affiliated with any of the services listed. Names and trademarks belong to their owners. A status shown here can be late or wrong, so please do not base anything important on a page with this name.</p>
</main>`;

  return layout({
    title: `About — ${BRAND}`,
    description,
    path: '/about',
    level: summary.headline.level,
    body,
    summary,
    data: [crumbs([BRAND, '/'], ['About', '/about']), { '@type': 'AboutPage', name: `About ${BRAND}`, url: PUBLIC_URL + '/about', description }],
  });
}

export function renderApi(summary) {
  const perMinute = Math.round(RATE_LIMIT_PER_SEC * 60);
  const origin = PUBLIC_URL || 'http://localhost:3000';
  const description = `Free JSON API for the live status of ${summary.total} internet services: GitHub, AWS, OpenAI, Cloudflare and the rest. No key, no signup, CORS enabled.`;

  const body = `<main class="prose">
<a class="back" href="/">← All services</a>
<h1>API</h1>
<p>Everything on this site is available as JSON. No key, no signup, and CORS is open, so it works straight from a browser. Responses are cached for 30 seconds and the data behind them is refreshed every two minutes.</p>
<pre><code>curl ${esc(origin)}/api/v2/summary.json</code></pre>

<h2>GET /api/v2/summary.json</h2>
<p>The status of every service, plus every open incident.</p>
<table>
<tr><th>Field</th><th>What it is</th></tr>
<tr><td><code>status.indicator</code></td><td>The internet as a whole: <code>none</code>, <code>minor</code> or <code>major</code></td></tr>
<tr><td><code>counts</code></td><td>How many services are in each state</td></tr>
<tr><td><code>components[]</code></td><td>One entry per service. <code>id</code> is the same slug as its page, so <code>github</code> lives at <a href="/github">/github</a></td></tr>
<tr><td><code>components[].status</code></td><td><code>operational</code>, <code>degraded_performance</code>, <code>partial_outage</code>, <code>major_outage</code>, <code>under_maintenance</code> or <code>unknown</code></td></tr>
<tr><td><code>components[].source</code></td><td>The official status page the reading came from</td></tr>
<tr><td><code>incidents[]</code></td><td>Open incidents, worst first. <code>impact</code> is <code>none</code>, <code>minor</code>, <code>major</code> or <code>critical</code></td></tr>
</table>
<pre><code>${esc(EXAMPLE)}</code></pre>

<h2>GET /api/v2/status.json</h2>
<p>Only <code>page</code> and <code>status</code> from the response above. Use it when all you need is whether today is a bad day.</p>

<h2>GET /feed.xml</h2>
<p>An Atom feed of the 50 most recent incidents across all services, for feed readers and bots.</p>

<h2>Limits</h2>
<p>About ${perMinute} requests a minute per IP address. Past that you get a <code>429</code> with a <code>Retry-After</code> header. Polling once a minute is plenty, since nothing changes faster than that.</p>
<p>The field names follow the Statuspage API where they can, so existing clients need little work. Statuses are whatever each provider reports about itself. See <a href="/about">About</a> for how that is collected.</p>
</main>`;

  return layout({
    title: `Free status API for ${summary.total} internet services — ${BRAND}`,
    description,
    path: '/api',
    level: summary.headline.level,
    body,
    summary,
    data: [
      crumbs([BRAND, '/'], ['API', '/api']),
      { '@type': 'WebAPI', name: `${BRAND} API`, description, url: PUBLIC_URL + '/api', documentation: PUBLIC_URL + '/api', provider: { '@type': 'Organization', name: BRAND, url: PUBLIC_URL + '/' } },
    ],
  });
}
