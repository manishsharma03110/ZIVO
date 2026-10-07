import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig } from '../lib/config.js';

const S = 's'.repeat(40), A = 'Ab12Cd34Ef', B = 'Zy98Xw76Vu';
const ok = (env) => checkConfig(env);
test('valid configuration', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A, CODE_B: B }).ok, true));
test('missing SESSION_SECRET', () => assert.equal(ok({ CODE_A: A, CODE_B: B }).ok, false));
test('short SESSION_SECRET', () => assert.equal(ok({ SESSION_SECRET: 'short', CODE_A: A, CODE_B: B }).ok, false));
test('missing CODE_A', () => assert.equal(ok({ SESSION_SECRET: S, CODE_B: B }).report.CODE_A, 'missing'));
test('missing CODE_B', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A }).report.CODE_B, 'missing'));
test('CODE_A too short', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: 'abc', CODE_B: B }).ok, false));
test('CODE_A too long', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A + 'x', CODE_B: B }).ok, false));
test('CODE_B too short', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A, CODE_B: 'abc' }).ok, false));
test('CODE_B too long', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A, CODE_B: B + 'x' }).ok, false));
test('CODE_A === CODE_B', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: A, CODE_B: A }).ok, false));
test('surrounding whitespace from a dashboard paste is trimmed', () => assert.equal(ok({ SESSION_SECRET: S + '\n', CODE_A: A + ' ', CODE_B: B }).ok, true));
test('inner whitespace rejected', () => assert.equal(ok({ SESSION_SECRET: S, CODE_A: 'Ab12 Cd34E', CODE_B: B }).ok, false));
test('Vercel without Redis is rejected', () => assert.equal(ok({ VERCEL: '1', SESSION_SECRET: S, CODE_A: A, CODE_B: B }).ok, false));
test('Vercel with Redis is accepted', () => assert.equal(ok({ VERCEL: '1', UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't', SESSION_SECRET: S, CODE_A: A, CODE_B: B }).ok, true));
test('report never contains secret values', () => {
  const r = JSON.stringify(ok({ SESSION_SECRET: S, CODE_A: A + 'x', CODE_B: B }));
  for (const v of [S, A, B]) assert.ok(!r.includes(v));
});
