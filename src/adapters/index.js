import statuspage from './statuspage.js';
import instatus from './instatus.js';
import betterstack from './betterstack.js';
import google from './google.js';
import aws from './aws.js';
import { azure, m365, apple, slack, heroku, statusio, oci, fastly, psn } from './misc.js';

const self = { current: async (_provider, ctx) => ctx.self() };

export const ADAPTERS = { self, statuspage, instatus, betterstack, google, aws, azure, m365, apple, slack, heroku, statusio, oci, fastly, psn };
