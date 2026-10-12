import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
delete process.env.ABLY_API_KEY;
