import statuspage from './statuspage.js';
import instatus from './instatus.js';
import betterstack from './betterstack.js';
import google from './google.js';
import aws from './aws.js';
import { azure, m365, apple, slack, heroku, statusio, oci, fastly, psn } from './misc.js';

/**
 * An adapter reads one status page format.
 *   current(provider, ctx) → { status, description, incidents, [components…], [history, coverageStart] }
 *   slow(provider, ctx)    → the same shape, for data that changes rarely (incident history)
 */
/** This site itself; its state is measured in-process (src/self.js), not fetched. */
const self = { current: async (_provider, ctx) => ctx.self() };

export const ADAPTERS = { self, statuspage, instatus, betterstack, google, aws, azure, m365, apple, slack, heroku, statusio, oci, fastly, psn };
