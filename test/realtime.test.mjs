import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCookieValue } from '../lib/auth.js';
import { createChannelStateHandler, isMessageSignal, pollingInterval, REALTIME_POLL_INTERVAL_MS, HIDDEN_POLL_INTERVAL_MS, FAST_POLL_INTERVAL_MS } from '../lib/realtime.js';
import { publishMessageSignal, scheduleMessageSignal } from '../lib/realtime-server.js';

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

const tokenRoute = await import('../app/api/realtime/token/route.js');
const messagesRoute = await import('../app/api/messages/route.js');
const cookie = 'chat_session=' + makeCookieValue('A');
const request = (url, { method = 'GET', body, session = true } = {}) => new Request('http://localhost' + url, {
  method,
  headers: { ...(session ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('realtime token route requires a session and disables cleanly without an API key', async () => {
  const unauthorized = await tokenRoute.GET(request('/api/realtime/token', { session: false }));
  assert.equal(unauthorized.status, 401);

  const disabled = await tokenRoute.GET(request('/api/realtime/token'));
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), { enabled: false, error: 'realtime disabled' });
});

test('realtime token capability is subscribe-only and limited to the chat channel', async () => {
  const key = 'app.testkey:mocked-secret-never-returned';
  process.env.ABLY_API_KEY = key;
  try {
    const response = await tokenRoute.GET(request('/api/realtime/token'));
    assert.equal(response.status, 200);
    const tokenRequest = await response.json();
    assert.equal(tokenRequest.ttl, 10 * 60 * 1000);
    assert.deepEqual(JSON.parse(tokenRequest.capability), { 'zivo-chat': ['subscribe'] });
    assert.equal(JSON.stringify(tokenRequest).includes(key), false);
    assert.equal(JSON.stringify(tokenRequest).includes('mocked-secret-never-returned'), false);
  } finally {
    delete process.env.ABLY_API_KEY;
  }
});

test('message sends still succeed without Ably and failed publishing is contained', async () => {
  const response = await messagesRoute.POST(request('/api/messages', {
    method: 'POST',
    body: { type: 'text', text: 'stored without realtime', cid: 'realtime-offline-1' },
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);

  const key = 'app.testkey:mocked-secret';
  process.env.ABLY_API_KEY = key;
  let published;
  class FailingRest {
    constructor(options) { assert.equal(options.key, key); }
    channels = {
      get: (name) => ({
        publish: async (event, data) => {
          published = { channel: name, event, data };
          throw new Error('mock publish failure');
        },
      }),
    };
  }
  try {
    assert.equal(await publishMessageSignal({ id: '1234567890-a1b2c3', at: 123 }, { RestClient: FailingRest }), false);
    assert.deepEqual(published, {
      channel: 'zivo-chat',
      event: 'msg',
      data: { type: 'msg', id: '1234567890-a1b2c3', at: 123 },
    });
    class SlowRest {
      channels = { get: () => ({ publish: () => new Promise(() => {}) }) };
    }
    assert.equal(await publishMessageSignal({ id: '1234567890-a1b2c3', at: 123 }, { RestClient: SlowRest, timeoutMs: 5 }), false);
  } finally {
    delete process.env.ABLY_API_KEY;
  }
});

test('message signal is deferred with after() and awaited with the bounded fallback', async () => {
  const signal = { type: 'msg', id: 'message-id', at: 123 };
  let deferred;
  let calls = 0;
  await scheduleMessageSignal(signal, {
    afterFn: (callback) => { deferred = callback; },
    publishFn: async (value) => { calls++; assert.deepEqual(value, signal); },
  });
  assert.equal(calls, 0);
  await deferred();
  assert.equal(calls, 1);

  let settled = false;
  await scheduleMessageSignal(signal, {
    afterFn: () => { throw new Error('after unavailable'); },
    publishFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      settled = true;
      throw new Error('mock Ably publish failed');
    },
  });
  assert.equal(settled, true);
});

test('poll backup relaxes only while the channel is attached and state transitions trigger immediate polls', () => {
  assert.equal(pollingInterval({ attached: true, hidden: false, inCall: false, idleWait: 1000 }), REALTIME_POLL_INTERVAL_MS);
  assert.equal(pollingInterval({ attached: false, hidden: false, inCall: false, idleWait: 1000 }), 1000);
  assert.equal(pollingInterval({ attached: false, hidden: false, inCall: false, idleWait: 3000 }), 3000);
  assert.equal(pollingInterval({ attached: true, hidden: false, inCall: true, idleWait: 1000 }), FAST_POLL_INTERVAL_MS);
  assert.equal(pollingInterval({ attached: false, hidden: true, inCall: false, idleWait: 1000 }), HIDDEN_POLL_INTERVAL_MS);

  let immediatePolls = 0;
  let fallbacks = 0;
  const stateChanged = createChannelStateHandler({
    onAttached: () => { immediatePolls++; },
    onUnavailable: () => { fallbacks++; },
  });
  stateChanged({ current: 'attaching' });
  stateChanged({ current: 'attached' });
  stateChanged({ current: 'attached' });
  stateChanged({ current: 'suspended' });
  stateChanged({ current: 'failed' });
  stateChanged({ current: 'disconnected' });
  stateChanged({ current: 'attached' });
  assert.equal(immediatePolls, 2);
  assert.equal(fallbacks, 4);

  assert.equal(isMessageSignal({ type: 'msg', id: 'message-id', at: 123 }), true);
  assert.equal(isMessageSignal({ type: 'msg', id: 'message-id', at: 123, text: 'must not be consumed' }), false);
  assert.equal(isMessageSignal({ type: 'call', id: 'call-id', at: 123 }), true);
  assert.equal(isMessageSignal({ type: 'other', id: 'x', at: 123 }), false);
  assert.equal(isMessageSignal({ type: 'msg', id: 4, at: 123 }), false);
});
