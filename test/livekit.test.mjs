import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCookieValue } from '../lib/auth.js';
import { kvDel, kvGet, kvSet } from '../lib/store.js';
import { callCostAction, CALL_MAX_DURATION_MS, CALL_RING_TIMEOUT_MS, CALL_SOLO_GRACE_MS, canJoinCall, cleanupLiveKitRoom, liveKitConfigured, liveKitRoomName } from '../lib/livekit.js';
import { createLiveKitCredentials } from '../lib/livekit-server.js';

Object.assign(process.env, {
  SESSION_SECRET: 'x'.repeat(40),
  CODE_A: 'Ab12Cd34Ef',
  CODE_B: 'Zy98Xw76Vu',
  NODE_ENV: 'test',
});
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;
delete process.env.ABLY_API_KEY;
delete process.env.LIVEKIT_API_KEY;
delete process.env.LIVEKIT_API_SECRET;
delete process.env.LIVEKIT_URL;
delete process.env.CALL_PROVIDER;

const tokenRoute = await import('../app/api/call/token/route.js');
const callRoute = await import('../app/api/call/route.js');
const cookieA = 'chat_session=' + makeCookieValue('A');
const cookieB = 'chat_session=' + makeCookieValue('B');
const request = (cookie) => new Request('http://localhost/api/call/token', { headers: cookie ? { cookie } : {} });
const postCall = (cookie, body) => new Request('http://localhost/api/call', {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('LiveKit token route requires a session and disables cleanly without provider credentials', async () => {
  assert.equal((await tokenRoute.GET(request(null))).status, 401);
  assert.equal((await tokenRoute.GET(request(cookieA))).status, 503);
  const revokedSid = 'a'.repeat(24);
  await kvSet(`rev:${revokedSid}`, 1, { ex: 120 });
  const revokedCookie = 'chat_session=' + makeCookieValue('A', { sid: revokedSid });
  assert.equal((await tokenRoute.GET(request(revokedCookie))).status, 401);
});

test('LiveKit token route restricts room access to the active call and never returns the API secret', async () => {
  process.env.LIVEKIT_API_KEY = 'test-api-key';
  process.env.LIVEKIT_API_SECRET = 'test-api-secret-which-is-never-returned';
  process.env.LIVEKIT_URL = 'wss://chat.example.invalid';
  try {
    const mockedTokenRoute = tokenRoute.createTokenRoute({
      tokenIssuer: async (callId, identity) => {
        assert.equal(callId, 'call-12345678');
        return { token: `mock-${identity}`, url: process.env.LIVEKIT_URL };
      },
    });
    await kvSet('call', { id: 'call-12345678', from: 'A', to: 'B', status: 'ringing', ts: Date.now() });
    const calleeBeforeAccept = await mockedTokenRoute(request(cookieB));
    assert.equal(calleeBeforeAccept.status, 403);
    const callerToken = await mockedTokenRoute(request(cookieA));
    assert.equal(callerToken.status, 200);
    const callerBody = await callerToken.json();
    assert.equal(callerBody.url, process.env.LIVEKIT_URL);
    assert.equal(JSON.stringify(callerBody).includes(process.env.LIVEKIT_API_SECRET), false);

    await kvSet('call', { id: 'call-12345678', from: 'A', to: 'B', status: 'active', ts: Date.now() });
    const calleeToken = await mockedTokenRoute(request(cookieB));
    assert.equal(calleeToken.status, 200);
    assert.equal(JSON.stringify(await calleeToken.json()).includes(process.env.LIVEKIT_API_SECRET), false);
    const callerActiveToken = await mockedTokenRoute(request(cookieA));
    assert.equal(callerActiveToken.status, 200);

    await kvSet('call', { id: 'call-outsider1', from: 'A', to: 'C', status: 'active', ts: Date.now() });
    assert.equal((await mockedTokenRoute(request(cookieB))).status, 403);
  } finally {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  }
});

test('LiveKit token grants are signed by a mocked SDK and scoped to the server-derived room', async () => {
  const grants = [];
  class FakeAccessToken {
    constructor(key, secret, options) {
      assert.equal(key, 'mock-key');
      assert.equal(secret, 'mock-secret');
      assert.deepEqual(options, { identity: 'A', ttl: '10m' });
    }
    addGrant(grant) { grants.push(grant); }
    async toJwt() { return 'mock-token'; }
  }
  const credentials = await createLiveKitCredentials('call-12345678', 'A', {
    Token: FakeAccessToken,
    env: { LIVEKIT_API_KEY: 'mock-key', LIVEKIT_API_SECRET: 'mock-secret', LIVEKIT_URL: 'wss://lk.invalid' },
  });
  assert.deepEqual(credentials, { token: 'mock-token', url: 'wss://lk.invalid' });
  assert.deepEqual(grants, [{
    roomJoin: true, room: 'zivo-call-call-12345678', canPublish: true, canSubscribe: true,
  }]);
  assert.equal(liveKitRoomName('not a call id'), null);
});

test('LiveKit call route keeps ring, answer and end transitions in Redis', async () => {
  await kvDel('call');
  Object.assign(process.env, {
    LIVEKIT_API_KEY: 'mock-key',
    LIVEKIT_API_SECRET: 'mock-secret',
    LIVEKIT_URL: 'wss://lk.invalid',
  });
  try {
    const started = await callRoute.POST(postCall(cookieA, { action: 'start', video: false }));
    assert.equal(started.status, 200);
    const { id } = await started.json();
    assert.match(id, /^[a-f0-9]{12}$/);
    const mockedTokenRoute = tokenRoute.createTokenRoute({
      tokenIssuer: async (_callId, identity) => ({ token: `mock-${identity}`, url: process.env.LIVEKIT_URL }),
    });
    assert.equal((await mockedTokenRoute(request(cookieB))).status, 403);

    assert.equal((await callRoute.POST(postCall(cookieB, { action: 'answer', id }))).status, 200);
    assert.equal((await mockedTokenRoute(request(cookieB))).status, 200);
    await kvSet('hb:A', id, { ex: 30 });
    await kvSet('hb:B', id, { ex: 30 });
    await kvSet(`call:solo:${id}`, Date.now(), { ex: 130 });
    assert.equal((await callRoute.POST(postCall(cookieB, { action: 'end', id }))).status, 200);
    assert.equal((await mockedTokenRoute(request(cookieA))).status, 403);
    assert.equal(await kvGet('hb:A'), null);
    assert.equal(await kvGet('hb:B'), null);
    assert.equal(await kvGet(`call:solo:${id}`), null);
  } finally {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  }
});

test('LiveKit heartbeats enforce total-duration and single-participant auto-end limits', async () => {
  const id = 'call-cost-limit';
  const now = Date.now();
  await kvSet('call', { id, from: 'A', to: 'B', status: 'active', ts: now - CALL_MAX_DURATION_MS }, { ex: 6 * 3600 });
  assert.equal((await callRoute.POST(postCall(cookieA, { action: 'ping', id }))).status, 200);
  assert.equal((await kvGet('call')).status, 'ended');

  const soloId = 'call-solo-limit';
  await kvSet('call', { id: soloId, from: 'A', to: 'B', status: 'active', ts: Date.now() }, { ex: 6 * 3600 });
  await kvSet(`call:solo:${soloId}`, Date.now() - CALL_SOLO_GRACE_MS - 1, { ex: 130 });
  assert.equal((await callRoute.POST(postCall(cookieA, { action: 'ping', id: soloId }))).status, 200);
  assert.equal((await kvGet('call')).status, 'ended');
});

test('call state and cost rules bound room access, total duration and single-participant calls', () => {
  const call = { id: 'call-12345678', from: 'A', to: 'B', status: 'ringing', ts: 100 };
  assert.equal(canJoinCall(call, 'A', 100), true);
  assert.equal(canJoinCall(call, 'B', 100), false);
  assert.equal(canJoinCall(call, 'A', 100 + CALL_RING_TIMEOUT_MS), false);
  assert.equal(canJoinCall({ ...call, status: 'active' }, 'B', 100), true);
  assert.equal(canJoinCall({ ...call, status: 'active' }, 'B'), true);
  assert.equal(liveKitConfigured({ CALL_PROVIDER: 'native', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', LIVEKIT_URL: 'wss://lk' }), false);
  assert.equal(liveKitConfigured({ LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), false);
  assert.deepEqual(callCostAction({ status: 'ringing', startedAt: 0, now: CALL_MAX_DURATION_MS, selfPresent: true, peerPresent: false }), { action: 'none', soloSince: null });
  assert.deepEqual(callCostAction({ status: 'active', startedAt: 0, now: 500, selfPresent: true, peerPresent: true }), { action: 'none', soloSince: null });
  assert.deepEqual(callCostAction({ status: 'active', startedAt: 0, now: 500, selfPresent: true, peerPresent: false }), { action: 'wait', soloSince: 500 });
  assert.equal(callCostAction({ status: 'active', startedAt: 0, now: CALL_SOLO_GRACE_MS + 501, selfPresent: true, peerPresent: false, soloSince: 500 }).action, 'end');
  assert.equal(callCostAction({ status: 'active', startedAt: 0, now: CALL_MAX_DURATION_MS, selfPresent: true, peerPresent: true }).action, 'end');
});

test('ending a LiveKit call disconnects the room and stops local tracks', async () => {
  let disconnected = false, stopped = false;
  cleanupLiveKitRoom({ disconnect: async () => { disconnected = true; } }, [{ stop: () => { stopped = true; } }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disconnected, true);
  assert.equal(stopped, true);
});
