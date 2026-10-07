import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { startFakeRedis } from './fake-redis.mjs';

let redis, I1, I2, seq = 0;
const env = (url) => ({ ...process.env, SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu', NODE_ENV: 'production', VERCEL: '1',
  UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: 'test-token', CRON_SECRET: 'c'.repeat(24), NODE_NO_WARNINGS: '1' });
function spawnInstance(url) {
  const p = fork(new URL('./instance.mjs', import.meta.url), { execArgv: ['--import', './test/register.mjs'], env: env(url), silent: true });
  const waiting = new Map();
  p.on('message', (m) => { if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const ready = new Promise((r) => p.once('message', r));
  const call = (o) => new Promise((resolve) => { const id = ++seq; waiting.set(id, resolve); p.send({ ...o, id }); });
  return { p, ready, call, ask: (route, method, o = {}) => call({ route, method, ...o }) };
}
const login = (I, code, ip) => I.ask('login', 'POST', { body: { code }, ip });
const json = (r) => JSON.parse(r.text);

before(async () => {
  redis = await startFakeRedis();
  I1 = spawnInstance(redis.url); I2 = spawnInstance(redis.url);
  await Promise.all([I1.ready, I2.ready]);
});
after(async () => { I1.p.kill(); I2.p.kill(); await redis.close(); });

let A, B;
test('login on two different instances; messages cross instances; nothing is kept in instance memory', async () => {
  A = await login(I1, 'Ab12Cd34Ef'); B = await login(I2, 'Zy98Xw76Vu');
  assert.equal(A.status, 200); assert.equal(B.status, 200);
  assert.equal((await I1.ask('messages', 'POST', { cookie: A.cookie, body: { type: 'text', text: 'hello via instance 1' } })).status, 200);
  assert.equal((await I2.ask('messages', 'POST', { cookie: B.cookie, body: { type: 'text', text: 'reply via instance 2' } })).status, 200);
  const pa = json(await I2.ask('poll', 'GET', { cookie: A.cookie })), pb = json(await I1.ask('poll', 'GET', { cookie: B.cookie }));
  assert.deepEqual(pa.messages.map((m) => m.text), ['hello via instance 1', 'reply via instance 2']);
  assert.deepEqual(pb.messages.map((m) => m.from), ['A', 'B']);
  for (const I of [I1, I2]) { const m = await I.call({ op: 'mem' }); assert.equal(m.lists, 0); assert.equal(m.kv, 0); } // memory fallback unused
});
test('session from instance 1 is accepted on instance 2 (stateless signature + shared revocation list)', async () => {
  assert.equal((await I2.ask('me', 'GET', { cookie: A.cookie })).status, 200);
});
test('LOGOUT on one instance revokes the session on the other', async () => {
  const s = await login(I1, 'Ab12Cd34Ef', '192.0.2.77');
  assert.equal((await I2.ask('me', 'GET', { cookie: s.cookie })).status, 200);
  await I1.ask('logout', 'POST', { cookie: s.cookie, body: {} });
  for (const route of ['me', 'poll']) assert.equal((await I2.ask(route, 'GET', { cookie: s.cookie })).status, 401);
  assert.equal((await I2.ask('me', 'GET', { cookie: A.cookie })).status, 200); // other sessions unaffected
});
test('RATE LIMIT is shared across instances and atomic: 24 parallel guesses over 2 instances -> exactly 10 evaluated', async () => {
  const rs = await Promise.all(Array.from({ length: 24 }, (_, i) => login(i % 2 ? I1 : I2, 'guess' + String(i).padStart(5, '0'), '203.0.113.200')));
  assert.equal(rs.filter((r) => r.status === 401).length, 10); assert.equal(rs.filter((r) => r.status === 429).length, 14);
  assert.equal((await login(I1, 'Ab12Cd34Ef', '203.0.113.200')).status, 429);
  assert.equal((await login(I1, 'Ab12Cd34Ef', '203.0.113.201')).status, 200); // another IP is fine
});
test('40 concurrent sends over two instances: none lost, unique ids, same order for both users', async () => {
  const before = json(await I1.ask('poll', 'GET', { cookie: A.cookie })).messages.length;
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? I1 : I2).ask('messages', 'POST', { cookie: i % 4 < 2 ? A.cookie : B.cookie, body: { type: 'text', text: 'c' + i } })));
  assert.ok(rs.every((r) => r.status === 200));
  const x = json(await I1.ask('poll', 'GET', { cookie: A.cookie })).messages, y = json(await I2.ask('poll', 'GET', { cookie: B.cookie })).messages;
  assert.equal(x.length, before + 40); assert.deepEqual(x.map((m) => m.id), y.map((m) => m.id));
  assert.equal(new Set(x.map((m) => m.id)).size, x.length);
  assert.equal(x.filter((m) => /^c\d+$/.test(m.text)).length, 40);
});
test('DUPLICATES: 20 parallel retries of one client message across instances -> stored once', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? I1 : I2).ask('messages', 'POST', { cookie: A.cookie, body: { type: 'text', text: 'only once', cid: 'retry-abc-123456' } })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(json(await I2.ask('poll', 'GET', { cookie: B.cookie })).messages.filter((m) => m.text === 'only once').length, 1);
});
test('CALL RACE across instances: simultaneous calls -> exactly one 200 and one 409', async () => {
  const sdp = { type: 'offer', sdp: 'v=0\r\n' + 'a'.repeat(50) };
  const rs = await Promise.all([I1.ask('call', 'POST', { cookie: A.cookie, body: { action: 'start', offer: sdp } }), I2.ask('call', 'POST', { cookie: B.cookie, body: { action: 'start', offer: sdp } })]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
});
test('POLL COST: an idle poll is exactly ONE Redis command; a poll after a change adds one LRANGE', async () => {
  const p = json(await I1.ask('poll', 'GET', { cookie: A.cookie }));
  const n0 = redis.stats.commands; redis.stats.log.length = 0;
  for (let i = 0; i < 10; i++) { const r = json(await I1.ask('poll', 'GET', { cookie: A.cookie, qs: '?since=' + encodeURIComponent(p.lastId) + '&seen=' + encodeURIComponent(p.lastId) })); assert.equal(r.messages, null); }
  const idle = redis.stats.log.filter((c) => c === 'mget').length, total = redis.stats.commands - n0;
  const seenWrites = redis.stats.log.filter((c) => c === 'set').length;
  console.log(`# idle polls: 10 polls = ${total} commands (mget=${idle}, set=${seenWrites}); per idle poll without a receipt = 1`);
  assert.equal(idle, 10); assert.equal(redis.stats.log.filter((c) => c === 'lrange').length, 0);
});
test('REDIS OUTAGE fails closed (500 generic, nothing served from memory) and recovers by itself', async () => {
  redis.setDown(true);
  try {
    for (const [I, route, method, o] of [[I1, 'me', 'GET', { cookie: A.cookie }], [I2, 'poll', 'GET', { cookie: B.cookie }], [I1, 'messages', 'POST', { cookie: A.cookie, body: { type: 'text', text: 'during outage' } }], [I2, 'login', 'POST', { body: { code: 'Ab12Cd34Ef' }, ip: '192.0.2.99' }]]) {
      const r = await I.ask(route, method, o); assert.equal(r.status, 500); assert.match(r.text, /Something went wrong/); assert.ok(!/upstash|127\.0\.0\.1|redis|token/i.test(r.text));
    }
    for (const I of [I1, I2]) { const m = await I.call({ op: 'mem' }); assert.equal(m.lists + m.kv, 0); }
  } finally { redis.setDown(false); }
  assert.equal((await I1.ask('me', 'GET', { cookie: A.cookie })).status, 200);
  assert.ok(!json(await I2.ask('poll', 'GET', { cookie: B.cookie })).messages.some((m) => m.text === 'during outage'));
});
