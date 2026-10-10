import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu', NODE_ENV: 'test' });
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL;
const R = (p) => import('../app/api/' + p + '/route.js');
const login = await R('login'), me = await R('me'), poll = await R('poll'), msgs = await R('messages'), call = await R('call'), media = await R('media'), logout = await R('logout');
const { kvDel, kvGet } = await import('../lib/store.js');

let ipN = 0;
const mk = (url, { method = 'GET', body, cookie, ip } = {}) => new Request('http://localhost' + url, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), 'x-forwarded-for': ip || `10.0.0.${++ipN}` },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});
async function signIn(code, ip) {
  const r = await login.POST(mk('/api/login', { method: 'POST', body: { code }, ip }));
  const sc = r.headers.get('set-cookie');
  return { r, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const A = (await signIn('Ab12Cd34Ef')), B = (await signIn('Zy98Xw76Vu'));
const C = { cookie: null };
const send = (who, text) => msgs.POST(mk('/api/messages', { method: 'POST', cookie: who.cookie, body: { type: 'text', text } }));
const getPoll = async (who, q = '') => (await poll.GET(mk('/api/poll' + q, { cookie: who.cookie }))).json();

test('valid login sets HttpOnly, SameSite=Strict, Max-Age cookie', () => {
  assert.equal(A.r.status, 200);
  assert.match(A.setCookie, /HttpOnly/i); assert.match(A.setCookie, /SameSite=strict/i); assert.match(A.setCookie, /Max-Age=120/i);
});
test('invalid login -> 401; wrong length -> 400; malformed body -> 400', async () => {
  assert.equal((await signIn('wrongcode1')).r.status, 401);
  assert.equal((await signIn('short')).r.status, 400);
  assert.equal((await login.POST(mk('/api/login', { method: 'POST', body: '{not json' }))).status, 400);
  assert.equal((await login.POST(mk('/api/login', { method: 'POST', body: { code: { $ne: '' } } }))).status, 400);
});
test('brute force: 10 wrong codes from one IP -> 429, even for the right code afterwards', async () => {
  const ip = '203.0.113.9';
  for (let i = 0; i < 10; i++) assert.equal((await signIn('wrongcode' + (i % 10), ip)).r.status, 401);
  assert.equal((await signIn('Ab12Cd34Ef', ip)).r.status, 429);
});
test('unauthenticated API access is rejected everywhere', async () => {
  assert.equal((await me.GET(mk('/api/me'))).status, 401);
  assert.equal((await poll.GET(mk('/api/poll'))).status, 401);
  assert.equal((await msgs.POST(mk('/api/messages', { method: 'POST', body: { type: 'text', text: 'hi' } }))).status, 401);
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', body: { action: 'ping' } }))).status, 401);
  assert.equal((await media.GET(mk('/api/media?id=x'))).status, 401);
});
test('forged / garbage cookies are rejected', async () => {
  for (const c of ['chat_session=abc', 'chat_session=.', 'chat_session=' + Buffer.from('{"u":"A","t":9999999999999}').toString('base64url') + '.AAAA'])
    assert.equal((await me.GET(mk('/api/me', { cookie: c }))).status, 401);
});
test('/api/me never leaks secrets or codes', async () => {
  const t = await (await me.GET(mk('/api/me', { cookie: A.cookie }))).text();
  for (const v of ['x'.repeat(40), 'Ab12Cd34Ef', 'Zy98Xw76Vu', 'CODE_A', 'SESSION_SECRET']) assert.ok(!t.includes(v));
});
test('missing config -> 500 with no secret values and no stack', async () => {
  const keep = process.env.CODE_B; process.env.CODE_B = 'Ab12Cd34Ef';
  try {
    const r = await login.POST(mk('/api/login', { method: 'POST', body: { code: 'Ab12Cd34Ef' } }));
    const t = await r.text();
    assert.equal(r.status, 500); assert.ok(!t.includes('Ab12Cd34Ef')); assert.ok(!/at .*\.js/.test(t));
  } finally { process.env.CODE_B = keep; }
});
test('send/receive, both users see the same conversation in order', async () => {
  assert.equal((await send(A, 'hello from A')).status, 200);
  assert.equal((await send(B, 'hello from B')).status, 200);
  const pa = await getPoll(A), pb = await getPoll(B);
  assert.deepEqual(pa.messages.map((m) => m.text), ['hello from A', 'hello from B']);
  assert.deepEqual(pb.messages.map((m) => m.text), ['hello from A', 'hello from B']);
  assert.deepEqual(pa.messages.map((m) => m.from), ['A', 'B']);
});
test('retrying an accepted message with the same cid returns the original id and stores it once', async () => {
  const cid = 'retry-message-123';
  const post = () => msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, body: { type: 'text', text: 'one copy', cid } }));
  const first = await (await post()).json();
  const retry = await (await post()).json();
  assert.equal(retry.duplicate, true);
  assert.equal(retry.id, first.id);
  const stored = (await getPoll(A)).messages.filter((m) => m.text === 'one copy');
  assert.equal(stored.length, 1);
});
test('successful message send triggers the bounded expired-media cleanup', async () => {
  await kvDel('expired-media-cleanup-lock');
  assert.equal((await send(A, 'cleanup trigger')).status, 200);
  assert.ok(await kvGet('expired-media-cleanup-lock'));
});
test('sender identity comes from the cookie, not the body', async () => {
  const r = await msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, body: { type: 'text', text: 'spoof', from: 'B', id: 'x' } }));
  assert.equal(r.status, 200);
  const m = (await getPoll(A)).messages.find((x) => x.text === 'spoof');
  assert.equal(m.from, 'A');
});
test('empty / whitespace / malformed / bad type / oversize payloads', async () => {
  const post = (body) => msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, body }));
  assert.equal((await post({ type: 'text', text: '   ' })).status, 400);
  assert.equal((await post('{bad')).status, 400);
  assert.equal((await post({ type: 'exec' })).status, 400);
  assert.equal((await post({ type: 'image', url: 'https://evil.example/x.png' })).status, 400);
  assert.equal((await post({ type: 'image', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post({ type: 'text', text: 'x'.repeat(50000) })).status, 413); // over the body-size limit
  assert.equal((await post({ type: 'text', text: 'x'.repeat(5000) })).status, 200); // under the limit, clipped to 2000 characters
  const long = (await getPoll(A)).messages.at(-1);
  assert.equal(Array.from(long.text).length, 2000);
});
test('XSS payloads are stored as inert text (React escapes on render; no HTML rendering of messages)', async () => {
  await send(A, '<script>alert(1)</script><img src=x onerror=alert(1)>');
  const m = (await getPoll(B)).messages.at(-1);
  assert.equal(m.text, '<script>alert(1)</script><img src=x onerror=alert(1)>');
  assert.equal(m.type, 'text');
});
test('unicode / emoji messages survive intact', async () => {
  await send(A, 'नमस्ते 😀 \u202e test');
  assert.equal((await getPoll(B)).messages.at(-1).text, 'नमस्ते 😀 \u202e test');
});
test('rapid concurrent sends: nothing lost, no duplicate ids', async () => {
  const before = (await getPoll(A)).messages.length;
  await Promise.all(Array.from({ length: 30 }, (_, i) => send(i % 2 ? A : B, 'burst ' + i)));
  const after = (await getPoll(A)).messages;
  assert.equal(after.length, before + 30);
  assert.equal(new Set(after.map((m) => m.id)).size, after.length);
});
test('poll "since" returns null messages when nothing changed (no needless payload)', async () => {
  const p = await getPoll(A);
  const p2 = await getPoll(A, '?since=' + encodeURIComponent(p.lastId));
  assert.equal(p2.messages, null);
});
test('poll renews the session cookie (sliding) and is no-store', async () => {
  const r = await poll.GET(mk('/api/poll', { cookie: A.cookie }));
  assert.match(r.headers.get('set-cookie'), /chat_session=/); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('read receipt only accepts a well-formed id and cannot be set for the other user', async () => {
  const last = (await getPoll(A)).lastId;
  await getPoll(B, '?seen=' + encodeURIComponent(last));
  assert.equal((await getPoll(A)).peerSeen, last);
  await getPoll(A, '?seen=' + encodeURIComponent('<script>'));
  assert.equal((await getPoll(B)).peerSeen !== '<script>', true);
});
test('call signaling: third party / outsider cannot answer; ids required to end', async () => {
  const sdp = (type) => ({ type, sdp: 'v=0\r\n' + 'a'.repeat(50) });
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: A.cookie, body: { action: 'start', offer: sdp('offer'), video: false } }))).status, 200);
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: A.cookie, body: { action: 'start', offer: sdp('offer') } }))).status, 409);
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: A.cookie, body: { action: 'answer', id: 'x', answer: sdp('answer') } }))).status, 404);
  const pb = await getPoll(B); assert.equal(pb.call.status, 'ringing'); assert.ok(pb.call.offer);
  assert.equal((await getPoll(A)).call.offer, undefined); // caller never receives its own offer back
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: B.cookie, body: { action: 'answer', id: pb.call.id, answer: { type: 'answer', sdp: 'x' } } }))).status, 400);
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: B.cookie, body: { action: 'answer', id: pb.call.id, answer: sdp('answer') } }))).status, 200);
  await call.POST(mk('/api/call', { method: 'POST', cookie: B.cookie, body: { action: 'end' } })); // no id -> ignored
  assert.equal((await getPoll(A)).call.status, 'active');
  await call.POST(mk('/api/call', { method: 'POST', cookie: B.cookie, body: { action: 'end', id: pb.call.id } }));
  assert.equal((await getPoll(A)).call.status, 'ended');
});
test('logout clears the cookie', async () => {
  const r = await logout.POST(mk('/api/logout', { method: 'POST', cookie: A.cookie }));
  assert.match(r.headers.get('set-cookie'), /chat_session=;|Max-Age=0/i);
});
test('local-only upload route is closed on Vercel', async () => {
  process.env.VERCEL = '1';
  try {
    const up = await import('../app/api/upload-local/route.js');
    assert.equal((await up.POST(mk('/api/upload-local', { method: 'POST', cookie: A.cookie }))).status, 404);
  } finally { delete process.env.VERCEL; }
});
