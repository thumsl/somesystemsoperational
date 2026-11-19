import { BRAND, PUBLIC_URL, SELF_SLUG } from './config.js';

export const CATEGORIES = [
  ['cloud', 'Cloud & Infrastructure'],
  ['ai', 'AI'],
  ['dev', 'Developer Tools'],
  ['data', 'Databases & Data'],
  ['observability', 'Monitoring & Incident Response'],
  ['comms', 'Communication & Messaging'],
  ['productivity', 'Productivity & Work'],
  ['business', 'Business & Support'],
  ['payments', 'Payments, Finance & Commerce'],
  ['security', 'Security & Identity'],
  ['web', 'Websites & Publishing'],
  ['consumer', 'Social, Media & Gaming'],
];

const list = [];
const add = (type) => (slug, name, category, base, extra = {}) =>
  list.push({ slug, name, category, type, base, page: base, ...extra });

const sp = add('statuspage');
const is = add('instatus');
const bs = add('betterstack');
const custom = (type, slug, name, category, page, extra = {}) =>
  list.push({ slug, name, category, type, base: page, page, ...extra });

const T1 = { tier1: true };

custom('aws', 'aws', 'Amazon Web Services', 'cloud', 'https://health.aws.amazon.com/health/status', T1);
custom('google', 'google-cloud', 'Google Cloud', 'cloud', 'https://status.cloud.google.com', T1);
custom('azure', 'azure', 'Microsoft Azure', 'cloud', 'https://azure.status.microsoft/en-us/status', T1);
sp('cloudflare', 'Cloudflare', 'cloud', 'https://www.cloudflarestatus.com', T1);
sp('vercel', 'Vercel', 'cloud', 'https://www.vercel-status.com', T1);
custom('oci', 'oracle-cloud', 'Oracle Cloud', 'cloud', 'https://ocistatus.oraclecloud.com');
sp('digitalocean', 'DigitalOcean', 'cloud', 'https://status.digitalocean.com');
sp('linode', 'Linode', 'cloud', 'https://status.linode.com');
sp('akamai', 'Akamai', 'cloud', 'https://www.akamaistatus.com');
custom('fastly', 'fastly', 'Fastly', 'cloud', 'https://www.fastlystatus.com');
sp('netlify', 'Netlify', 'cloud', 'https://www.netlifystatus.com');
sp('render', 'Render', 'cloud', 'https://status.render.com');
sp('fly-io', 'Fly.io', 'cloud', 'https://status.fly.io');
custom('heroku', 'heroku', 'Heroku', 'cloud', 'https://status.heroku.com');
custom('google', 'firebase', 'Firebase', 'cloud', 'https://status.firebase.google.com');
sp('scaleway', 'Scaleway', 'cloud', 'https://status.scaleway.com');
sp('ovhcloud', 'OVHcloud Public Cloud', 'cloud', 'https://public-cloud.status-ovhcloud.com');
sp('bunny-net', 'bunny.net', 'cloud', 'https://status.bunny.net');
sp('cloudinary', 'Cloudinary', 'cloud', 'https://status.cloudinary.com');
sp('imgix', 'imgix', 'cloud', 'https://status.imgix.com');
sp('mux', 'Mux', 'cloud', 'https://status.mux.com');
sp('ngrok', 'ngrok', 'cloud', 'https://status.ngrok.com');
sp('tailscale', 'Tailscale', 'cloud', 'https://status.tailscale.com');
sp('godaddy', 'GoDaddy', 'cloud', 'https://status.godaddy.com');
sp('digicert', 'DigiCert', 'cloud', 'https://status.digicert.com');
sp('cdnjs', 'cdnjs', 'cloud', 'https://status.cdnjs.com');
sp('convex', 'Convex', 'cloud', 'https://status.convex.dev');
sp('hashicorp', 'HashiCorp', 'cloud', 'https://status.hashicorp.com');
sp('pulumi', 'Pulumi', 'cloud', 'https://status.pulumi.com');
sp('temporal', 'Temporal', 'cloud', 'https://status.temporal.io');
sp('inngest', 'Inngest', 'cloud', 'https://status.inngest.com');
bs('trigger-dev', 'Trigger.dev', 'cloud', 'https://status.trigger.dev');

sp('openai', 'OpenAI', 'ai', 'https://status.openai.com', T1);
sp('anthropic', 'Anthropic (Claude)', 'ai', 'https://status.claude.com', T1);
sp('mistral', 'Mistral AI', 'ai', 'https://status.mistral.ai');
sp('cohere', 'Cohere', 'ai', 'https://status.cohere.com');
sp('perplexity', 'Perplexity', 'ai', 'https://status.perplexity.com');
sp('groq', 'Groq', 'ai', 'https://groqstatus.com');
sp('cerebras', 'Cerebras', 'ai', 'https://status.cerebras.ai');
sp('fireworks-ai', 'Fireworks AI', 'ai', 'https://status.fireworks.ai');
bs('together-ai', 'Together AI', 'ai', 'https://status.together.ai');
bs('hugging-face', 'Hugging Face', 'ai', 'https://status.huggingface.co');
bs('modal', 'Modal', 'ai', 'https://status.modal.com');
sp('anyscale', 'Anyscale', 'ai', 'https://status.anyscale.com');
sp('elevenlabs', 'ElevenLabs', 'ai', 'https://status.elevenlabs.io');
sp('assemblyai', 'AssemblyAI', 'ai', 'https://status.assemblyai.com');
sp('deepgram', 'Deepgram', 'ai', 'https://status.deepgram.com');
sp('runway', 'Runway', 'ai', 'https://status.runwayml.com');
sp('stability-ai', 'Stability AI', 'ai', 'https://status.stability.ai');
sp('pinecone', 'Pinecone', 'ai', 'https://status.pinecone.io');
sp('cursor', 'Cursor', 'ai', 'https://status.cursor.com');
sp('windsurf', 'Windsurf', 'ai', 'https://status.windsurf.com');
sp('lovable', 'Lovable', 'ai', 'https://status.lovable.dev');
sp('replit', 'Replit', 'ai', 'https://status.replit.com');
sp('scale-ai', 'Scale AI', 'ai', 'https://status.scale.com');
sp('weights-and-biases', 'Weights & Biases', 'ai', 'https://status.wandb.com');

sp('github', 'GitHub', 'dev', 'https://www.githubstatus.com', T1);
custom('statusio', 'gitlab', 'GitLab', 'dev', 'https://status.gitlab.com', { statusioId: '5b36dc6502d06804c08349f7' });
sp('bitbucket', 'Bitbucket', 'dev', 'https://bitbucket.status.atlassian.com');
sp('npm', 'npm', 'dev', 'https://status.npmjs.org', T1);
sp('docker', 'Docker', 'dev', 'https://www.dockerstatus.com', T1);
sp('pypi', 'Python & PyPI', 'dev', 'https://status.python.org');
sp('rubygems', 'RubyGems', 'dev', 'https://status.rubygems.org');
sp('crates-io', 'crates.io', 'dev', 'https://status.crates.io');
sp('maven-central', 'Maven Central', 'dev', 'https://status.maven.org');
sp('cocoapods', 'CocoaPods', 'dev', 'https://status.cocoapods.org');
sp('hex-pm', 'Hex.pm', 'dev', 'https://status.hex.pm');
sp('nodejs', 'Node.js', 'dev', 'https://status.nodejs.org');
custom('apple', 'apple-developer', 'Apple Developer', 'dev', 'https://developer.apple.com/system-status/', {
  feed: 'https://www.apple.com/support/systemstatus/data/developer/system_status_en_US.js',
});
sp('circleci', 'CircleCI', 'dev', 'https://status.circleci.com');
sp('travis-ci', 'Travis CI', 'dev', 'https://www.traviscistatus.com');
sp('buildkite', 'Buildkite', 'dev', 'https://www.buildkitestatus.com');
sp('gradle', 'Gradle', 'dev', 'https://status.gradle.com');
sp('jfrog', 'JFrog', 'dev', 'https://status.jfrog.io');
sp('cloudsmith', 'Cloudsmith', 'dev', 'https://status.cloudsmith.io');
sp('quay', 'Red Hat Quay', 'dev', 'https://status.quay.io');
sp('sonatype', 'Sonatype', 'dev', 'https://status.sonatype.com');
sp('codecov', 'Codecov', 'dev', 'https://status.codecov.com');
sp('postman', 'Postman', 'dev', 'https://status.postman.com');
sp('expo', 'Expo', 'dev', 'https://status.expo.dev');
sp('launchdarkly', 'LaunchDarkly', 'dev', 'https://status.launchdarkly.com');
sp('statsig', 'Statsig', 'dev', 'https://status.statsig.com');
sp('harness', 'Harness', 'dev', 'https://status.split.io');
sp('optimizely', 'Optimizely', 'dev', 'https://status.optimizely.com');
sp('browserstack', 'BrowserStack', 'dev', 'https://status.browserstack.com');
sp('sauce-labs', 'Sauce Labs', 'dev', 'https://status.saucelabs.com');
bs('chromatic', 'Chromatic', 'dev', 'https://status.chromatic.com');
bs('codesandbox', 'CodeSandbox', 'dev', 'https://status.codesandbox.io');
sp('apollo-graphql', 'Apollo GraphQL', 'dev', 'https://status.apollographql.com');
sp('prisma', 'Prisma', 'dev', 'https://status.prisma.io');
sp('warp', 'Warp', 'dev', 'https://status.warp.dev');
is('zed', 'Zed', 'dev', 'https://status.zed.dev');
bs('raycast', 'Raycast', 'dev', 'https://status.raycast.com');
sp('readme', 'ReadMe', 'dev', 'https://status.readme.com');
sp('mintlify', 'Mintlify', 'dev', 'https://status.mintlify.com');

sp('mongodb', 'MongoDB Atlas', 'data', 'https://status.mongodb.com');
sp('supabase', 'Supabase', 'data', 'https://status.supabase.com');
sp('planetscale', 'PlanetScale', 'data', 'https://www.planetscalestatus.com');
sp('upstash', 'Upstash', 'data', 'https://status.upstash.com');
sp('cockroachdb', 'CockroachDB Cloud', 'data', 'https://status.cockroachlabs.cloud');
sp('snowflake', 'Snowflake', 'data', 'https://status.snowflake.com');
sp('confluent', 'Confluent Cloud', 'data', 'https://status.confluent.cloud');
sp('elastic', 'Elastic Cloud', 'data', 'https://status.elastic.co');
sp('clickhouse', 'ClickHouse Cloud', 'data', 'https://status.clickhouse.com');
sp('influxdb', 'InfluxDB Cloud', 'data', 'https://status.influxdata.com');
sp('yugabytedb', 'YugabyteDB', 'data', 'https://status.yugabyte.cloud');
sp('aiven', 'Aiven', 'data', 'https://status.aiven.io');
bs('turso', 'Turso', 'data', 'https://status.turso.tech');
sp('fivetran', 'Fivetran', 'data', 'https://status.fivetran.com');
is('airbyte', 'Airbyte', 'data', 'https://status.airbyte.com');
sp('hex', 'Hex', 'data', 'https://status.hex.tech');
sp('segment', 'Segment', 'data', 'https://status.segment.com');
sp('mixpanel', 'Mixpanel', 'data', 'https://www.mixpanelstatus.com');

custom('self', SELF_SLUG, BRAND, 'observability', PUBLIC_URL || 'https://localhost', { self: true, tier1: true });
sp('sentry', 'Sentry', 'observability', 'https://status.sentry.io');
sp('new-relic', 'New Relic', 'observability', 'https://status.newrelic.com');
sp('grafana', 'Grafana Cloud', 'observability', 'https://status.grafana.com');
sp('honeycomb', 'Honeycomb', 'observability', 'https://status.honeycomb.io');
sp('bugsnag', 'BugSnag', 'observability', 'https://status.bugsnag.com');
sp('rollbar', 'Rollbar', 'observability', 'https://status.rollbar.com');
sp('logrocket', 'LogRocket', 'observability', 'https://status.logrocket.com');
sp('fullstory', 'Fullstory', 'observability', 'https://status.fullstory.com');
sp('hotjar', 'Hotjar', 'observability', 'https://status.hotjar.com');
sp('opsgenie', 'Opsgenie', 'observability', 'https://status.opsgenie.com');
sp('incident-io', 'incident.io', 'observability', 'https://status.incident.io');
bs('better-stack', 'Better Stack', 'observability', 'https://status.betterstack.com');

custom('slack', 'slack', 'Slack', 'comms', 'https://slack-status.com', T1);
sp('discord', 'Discord', 'comms', 'https://discordstatus.com', T1);
sp('zoom', 'Zoom', 'comms', 'https://www.zoomstatus.com', T1);
sp('goto', 'GoTo', 'comms', 'https://status.gotomeeting.com');
sp('teamviewer', 'TeamViewer', 'comms', 'https://status.teamviewer.com');
sp('anydesk', 'AnyDesk', 'comms', 'https://status.anydesk.com');
sp('loom', 'Loom', 'comms', 'https://www.loomstatus.com');
sp('riverside', 'Riverside', 'comms', 'https://status.riverside.fm');
sp('livekit', 'LiveKit', 'comms', 'https://status.livekit.io');
sp('daily', 'Daily', 'comms', 'https://status.daily.co');
sp('twilio', 'Twilio', 'comms', 'https://status.twilio.com');
sp('bird', 'Bird', 'comms', 'https://status.messagebird.com');
sp('ably', 'Ably', 'comms', 'https://status.ably.com');
sp('pusher', 'Pusher', 'comms', 'https://status.pusher.com');
sp('onesignal', 'OneSignal', 'comms', 'https://status.onesignal.com');
sp('mailgun', 'Mailgun', 'comms', 'https://status.mailgun.com');
sp('mailjet', 'Mailjet', 'comms', 'https://status.mailjet.com');
sp('sparkpost', 'SparkPost', 'comms', 'https://status.sparkpost.com');
sp('resend', 'Resend', 'comms', 'https://resend-status.com');
sp('brevo', 'Brevo', 'comms', 'https://status.brevo.com');
sp('customer-io', 'Customer.io', 'comms', 'https://status.customer.io');
sp('braze', 'Braze', 'comms', 'https://status.braze.com');
sp('iterable', 'Iterable', 'comms', 'https://status.iterable.com');
sp('klaviyo', 'Klaviyo', 'comms', 'https://status.klaviyo.com');

custom('m365', 'microsoft-365', 'Microsoft 365', 'productivity', 'https://status.cloud.microsoft', T1);
custom('google', 'google-workspace', 'Google Workspace', 'productivity', 'https://www.google.com/appsstatus/dashboard', T1);
sp('notion', 'Notion', 'productivity', 'https://www.notion-status.com');
sp('jira', 'Jira', 'productivity', 'https://jira-software.status.atlassian.com');
sp('confluence', 'Confluence', 'productivity', 'https://confluence.status.atlassian.com');
sp('trello', 'Trello', 'productivity', 'https://trello.status.atlassian.com');
sp('linear', 'Linear', 'productivity', 'https://linearstatus.com');
sp('asana', 'Asana', 'productivity', 'https://status.asana.com');
sp('monday-com', 'monday.com', 'productivity', 'https://status.monday.com');
sp('clickup', 'ClickUp', 'productivity', 'https://status.clickup.com');
sp('shortcut', 'Shortcut', 'productivity', 'https://status.shortcut.com');
sp('airtable', 'Airtable', 'productivity', 'https://status.airtable.com');
sp('coda', 'Coda', 'productivity', 'https://status.coda.io');
sp('smartsheet', 'Smartsheet', 'productivity', 'https://status.smartsheet.com');
sp('figma', 'Figma', 'productivity', 'https://status.figma.com');
sp('canva', 'Canva', 'productivity', 'https://www.canvastatus.com');
sp('miro', 'Miro', 'productivity', 'https://status.miro.com');
sp('dropbox', 'Dropbox', 'productivity', 'https://status.dropbox.com');
sp('box', 'Box', 'productivity', 'https://status.box.com');
sp('typeform', 'Typeform', 'productivity', 'https://status.typeform.com');
sp('zapier', 'Zapier', 'productivity', 'https://status.zapier.com');
sp('make', 'Make', 'productivity', 'https://status.make.com');
sp('ifttt', 'IFTTT', 'productivity', 'https://status.ifttt.com');
sp('retool', 'Retool', 'productivity', 'https://status.retool.com');
sp('bubble', 'Bubble', 'productivity', 'https://status.bubble.io');
sp('grammarly', 'Grammarly', 'productivity', 'https://status.grammarly.com');
is('todoist', 'Todoist', 'productivity', 'https://status.todoist.net');
sp('superhuman', 'Superhuman', 'productivity', 'https://status.superhuman.com');
sp('otter-ai', 'Otter.ai', 'productivity', 'https://status.otter.ai');
sp('descript', 'Descript', 'productivity', 'https://status.descript.com');
is('gamma', 'Gamma', 'productivity', 'https://status.gamma.app');
sp('proton', 'Proton', 'productivity', 'https://status.proton.me');
is('fastmail', 'Fastmail', 'productivity', 'https://fastmailstatus.com');

sp('hubspot', 'HubSpot', 'business', 'https://status.hubspot.com');
sp('salesloft', 'Salesloft', 'business', 'https://status.salesloft.com');
sp('gong', 'Gong', 'business', 'https://status.gong.io');
bs('apollo-io', 'Apollo.io', 'business', 'https://status.apollo.io');
sp('attio', 'Attio', 'business', 'https://status.attio.com');
sp('close', 'Close', 'business', 'https://status.close.com');
sp('clay', 'Clay', 'business', 'https://status.clay.com');
sp('gorgias', 'Gorgias', 'business', 'https://status.gorgias.com');
sp('help-scout', 'Help Scout', 'business', 'https://status.helpscout.com');
sp('livechat', 'LiveChat', 'business', 'https://status.livechat.com');
sp('tawk-to', 'tawk.to', 'business', 'https://status.tawk.to');
sp('gusto', 'Gusto', 'business', 'https://status.gusto.com');
sp('rippling', 'Rippling', 'business', 'https://status.rippling.com');
sp('xero', 'Xero', 'business', 'https://status.xero.com');
sp('quickbooks', 'QuickBooks', 'business', 'https://status.quickbooks.intuit.com');

sp('shopify', 'Shopify', 'payments', 'https://www.shopifystatus.com', T1);
sp('square', 'Square', 'payments', 'https://www.issquareup.com');
sp('paddle', 'Paddle', 'payments', 'https://paddlestatus.com');
sp('chargebee', 'Chargebee', 'payments', 'https://status.chargebee.com');
sp('plaid', 'Plaid', 'payments', 'https://status.plaid.com');
sp('klarna', 'Klarna', 'payments', 'https://status.klarna.com');
sp('wise', 'Wise', 'payments', 'https://status.wise.com');
sp('brex', 'Brex', 'payments', 'https://status.brex.com');
sp('coinbase', 'Coinbase', 'payments', 'https://status.coinbase.com');
sp('kraken', 'Kraken', 'payments', 'https://status.kraken.com');
sp('robinhood', 'Robinhood', 'payments', 'https://status.robinhood.com');
sp('bigcommerce', 'BigCommerce', 'payments', 'https://status.bigcommerce.com');

sp('1password', '1Password', 'security', 'https://status.1password.com');
sp('lastpass', 'LastPass', 'security', 'https://status.lastpass.com');
sp('duo', 'Duo', 'security', 'https://status.duo.com');
sp('clerk', 'Clerk', 'security', 'https://status.clerk.com');
sp('workos', 'WorkOS', 'security', 'https://status.workos.com');
sp('snyk', 'Snyk', 'security', 'https://status.snyk.io');
sp('sentinelone', 'SentinelOne', 'security', 'https://status.sentinelone.com');
sp('palo-alto-networks', 'Palo Alto Networks', 'security', 'https://status.paloaltonetworks.com');
bs('nordvpn', 'NordVPN', 'security', 'https://status.nordvpn.com');

sp('squarespace', 'Squarespace', 'web', 'https://status.squarespace.com');
sp('wix', 'Wix', 'web', 'https://status.wix.com');
sp('webflow', 'Webflow', 'web', 'https://status.webflow.com');
bs('framer', 'Framer', 'web', 'https://status.framer.com');
sp('contentful', 'Contentful', 'web', 'https://status.contentful.com');
sp('sanity', 'Sanity', 'web', 'https://status.sanity.io');
bs('strapi', 'Strapi', 'web', 'https://status.strapi.io');
sp('medium', 'Medium', 'web', 'https://status.medium.com');
sp('substack', 'Substack', 'web', 'https://substack.statuspage.io');
sp('beehiiv', 'beehiiv', 'web', 'https://status.beehiiv.com');
sp('buttondown', 'Buttondown', 'web', 'https://status.buttondown.com');
sp('dev-to', 'DEV Community', 'web', 'https://status.dev.to');
bs('hashnode', 'Hashnode', 'web', 'https://status.hashnode.com');
sp('vimeo', 'Vimeo', 'web', 'https://www.vimeostatus.com');
is('wistia', 'Wistia', 'web', 'https://status.wistia.com');

custom('apple', 'apple', 'Apple Services', 'consumer', 'https://www.apple.com/support/systemstatus/', {
  feed: 'https://www.apple.com/support/systemstatus/data/system_status_en_US.js',
  tier1: true,
});
sp('reddit', 'Reddit', 'consumer', 'https://www.redditstatus.com', T1);
sp('twitch', 'Twitch', 'consumer', 'https://status.twitch.com');
sp('epic-games', 'Epic Games', 'consumer', 'https://status.epicgames.com');
custom('psn', 'playstation-network', 'PlayStation Network', 'consumer', 'https://status.playstation.com');
sp('pinterest', 'Pinterest', 'consumer', 'https://status.pinterest.com');
is('bluesky', 'Bluesky', 'consumer', 'https://status.bsky.app');
is('mastodon-social', 'mastodon.social', 'consumer', 'https://status.mastodon.social');
sp('patreon', 'Patreon', 'consumer', 'https://status.patreon.com');
sp('duolingo', 'Duolingo', 'consumer', 'https://status.duolingo.com');
sp('strava', 'Strava', 'consumer', 'https://status.strava.com');
sp('wikimedia', 'Wikipedia (Wikimedia)', 'consumer', 'https://www.wikimediastatus.net');
sp('plex', 'Plex', 'consumer', 'https://status.plex.tv');
sp('sonos', 'Sonos', 'consumer', 'https://status.sonos.com');
sp('ring', 'Ring', 'consumer', 'https://status.ring.com');
sp('smartthings', 'SmartThings', 'consumer', 'https://status.smartthings.com');
sp('vrchat', 'VRChat', 'consumer', 'https://status.vrchat.com');
is('kagi', 'Kagi', 'consumer', 'https://status.kagi.com');
bs('brave', 'Brave', 'consumer', 'https://status.brave.com');

export const PROVIDERS = list;
export const PROVIDERS_BY_SLUG = new Map(list.map((p) => [p.slug, p]));
