import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu', NODE_ENV: 'test', CRON_SECRET: 'c'.repeat(24) });
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL;
const R = (p) => import('../app/api/' + p + '/route.js');
const login = await R('login'), me = await R('me'), poll = await R('poll'), msgs = await R('messages'), call = await R('call'),
  media = await R('media'), logout = await R('logout'), upl = await R('upload-local'), cron = await R('cron/cleanup'), upload = await R('upload');
const { makeCookieValue, getSession } = await import('../lib/auth.js');

let n = 0;
const mk = (url, { method = 'GET', body, cookie, ip, ct = 'application/json', raw } = {}) => new Request('http://localhost' + url, {
  method, headers: { ...(ct ? { 'content-type': ct } : {}), ...(cookie ? { cookie } : {}), 'x-forwarded-for': ip || `198.51.100.${++n}` },
  body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
});
async function signIn(code, ip) {
  const r = await login.POST(mk('/api/login', { method: 'POST', body: { code }, ip }));
  const sc = r.headers.get('set-cookie');
  return { r, cookie: sc ? sc.split(';')[0] : null };
}
const A = await signIn('Ab12Cd34Ef'), B = await signIn('Zy98Xw76Vu');
const send = (who, body) => msgs.POST(mk('/api/messages', { method: 'POST', cookie: who.cookie, body: { type: 'text', ...body } }));
const poll_ = async (who, q = '') => (await poll.GET(mk('/api/poll' + q, { cookie: who.cookie }))).json();
const sdp = (type) => ({ type, sdp: 'v=0\r\n' + 'a'.repeat(50) });

test('RACE: 30 parallel wrong guesses from one IP -> exactly 10 are evaluated, 20 are blocked (atomic limiter)', async () => {
  const ip = '203.0.113.50';
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => signIn('guess' + String(i).padStart(5, '0'), ip)));
  const c = (st) => rs.filter((x) => x.r.status === st).length;
  assert.equal(c(401), 10); assert.equal(c(429), 20);
});
test('successful logins never count towards the limit (25 logins from one IP all succeed)', async () => {
  const rs = [];
  for (let i = 0; i < 25; i++) rs.push((await signIn('Ab12Cd34Ef', '203.0.113.51')).r.status);
  assert.deepEqual([...new Set(rs)], [200]);
});
test('every login creates a NEW session id (no fixation)', async () => {
  const x = await signIn('Ab12Cd34Ef'), y = await signIn('Ab12Cd34Ef');
  assert.notEqual(x.cookie, y.cookie);
});
test('LOGOUT revokes the session server-side: the old cookie is dead, other sessions keep working', async () => {
  const s1 = await signIn('Ab12Cd34Ef'), s2 = await signIn('Ab12Cd34Ef');
  assert.equal((await me.GET(mk('/api/me', { cookie: s1.cookie }))).status, 200);
  assert.equal((await logout.POST(mk('/api/logout', { method: 'POST', cookie: s1.cookie }))).status, 200);
  for (const [fn, req] of [[me.GET, mk('/api/me', { cookie: s1.cookie })], [poll.GET, mk('/api/poll', { cookie: s1.cookie })],
    [msgs.POST, mk('/api/messages', { method: 'POST', cookie: s1.cookie, body: { type: 'text', text: 'x' } })],
    [call.POST, mk('/api/call', { method: 'POST', cookie: s1.cookie, body: { action: 'ping' } })],
    [upl.POST, mk('/api/upload-local', { method: 'POST', cookie: s1.cookie, ct: null })]])
    assert.equal((await fn(req)).status, 401);
  assert.equal((await me.GET(mk('/api/me', { cookie: s2.cookie }))).status, 200);
});
test('absolute session lifetime (12h) cannot be extended by renewal', () => {
  const old = makeCookieValue('A', { iat: Date.now() - 13 * 3600 * 1000 });
  assert.equal(getSession({ headers: new Headers({ cookie: 'chat_session=' + encodeURIComponent(old) }) }), null);
});
test('cookie from the poll renewal keeps the same session id and original login time', async () => {
  const s = await signIn('Ab12Cd34Ef');
  const r = await poll.GET(mk('/api/poll', { cookie: s.cookie }));
  const c2 = r.headers.get('set-cookie').split(';')[0];
  const g = (c) => getSession({ headers: new Headers({ cookie: c }) });
  assert.equal(g(c2).s, g(s.cookie).s); assert.equal(g(c2).i, g(s.cookie).i);
});
test('content-type and size limits: 415 / 413', async () => {
  assert.equal((await msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, ct: 'text/plain', raw: '{"type":"text","text":"hi"}' }))).status, 415);
  assert.equal((await msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, ct: null, raw: '{"type":"text","text":"hi"}' }))).status, 415);
  assert.equal((await login.POST(mk('/api/login', { method: 'POST', body: { code: 'a'.repeat(5000) } }))).status, 413);
  assert.equal((await call.POST(mk('/api/call', { method: 'POST', cookie: A.cookie, body: { action: 'start', offer: { type: 'offer', sdp: 'a'.repeat(200000) } } }))).status, 413);
  assert.equal((await send(A, { text: 'x'.repeat(100000) })).status, 413);
});
test('malformed shapes fail safely (array, null, string, missing fields, unexpected fields)', async () => {
  for (const raw of ['[]', 'null', '"str"', '{}', '12']) assert.equal((await msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, raw }))).status, 400);
  assert.equal((await send(A, { text: 'ok', unexpected: { deep: [1, 2] }, createdAt: 1, from: 'B', id: 'evil' })).status, 200);
  const m = (await poll_(A)).messages.at(-1);
  assert.equal(m.from, 'A'); assert.notEqual(m.id, 'evil'); assert.ok(m.createdAt > 1e12); assert.ok(!('unexpected' in m));
});
test('prototype pollution payload does not pollute Object.prototype', async () => {
  const r = await msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, raw: '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}},"type":"text","text":"pp"}' }));
  assert.equal(r.status, 200); assert.equal({}.polluted, undefined); assert.equal({}.polluted2, undefined);
});
test('DUPLICATES: 10 parallel sends with the same client id store exactly one message', async () => {
  const cid = 'cid-' + 'a1b2c3d4e5';
  const rs = await Promise.all(Array.from({ length: 10 }, () => send(A, { text: 'dedupe me', cid })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await poll_(B)).messages.filter((m) => m.text === 'dedupe me').length, 1);
  await send(A, { text: 'dedupe me', cid }); // late retry
  assert.equal((await poll_(B)).messages.filter((m) => m.text === 'dedupe me').length, 1);
  await send(A, { text: 'dedupe me', cid: 'cid-other-12345' }); // a genuinely different message is kept
  assert.equal((await poll_(B)).messages.filter((m) => m.text === 'dedupe me').length, 2);
});
test('same client id from the two users does not collide', async () => {
  const cid = 'shared-cid-9999';
  await send(A, { text: 'from a', cid }); await send(B, { text: 'from b', cid });
  const t = (await poll_(A)).messages.map((m) => m.text);
  assert.ok(t.includes('from a') && t.includes('from b'));
});
test('CALL RACE: both people start a call at the same moment -> exactly one wins, the other gets 409', async () => {
  await new Promise((r) => setTimeout(r, 5));
  const start = (who) => call.POST(mk('/api/call', { method: 'POST', cookie: who.cookie, body: { action: 'start', offer: sdp('offer') } }));
  const rs = await Promise.all([start(A), start(B)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
});
test('CALL RACE: 20 parallel starts from one user -> exactly one call is created', async () => {
  const end = async () => { const c = (await poll_(A)).call; if (c) { for (const w of [A, B]) await call.POST(mk('/api/call', { method: 'POST', cookie: w.cookie, body: { action: 'end', id: c.id } })); } };
  await end();
  const rs = await Promise.all(Array.from({ length: 20 }, () => call.POST(mk('/api/call', { method: 'POST', cookie: A.cookie, body: { action: 'start', offer: sdp('offer') } }))));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
});
test('FAIL CLOSED: in production without Redis nothing silently falls back to memory', async () => {
  const keep = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
  try {
    const l = await login.POST(mk('/api/login', { method: 'POST', body: { code: 'Ab12Cd34Ef' } }));
    const lt = await l.text();
    assert.equal(l.status, 500); assert.match(lt, /Something went wrong/); assert.ok(!/redis/i.test(lt));
    for (const r of [await me.GET(mk('/api/me', { cookie: A.cookie })), await poll.GET(mk('/api/poll', { cookie: A.cookie })), await send(A, { text: 'x' })]) {
      assert.equal(r.status, 500); const t = await r.text();
      assert.ok(/Something went wrong/.test(t) && !/redis|stack|\.js|\/home/i.test(t));
    }
    assert.ok(errs.some((e) => /Redis/.test(e))); // the reason is in the server log
    for (const sec of ['x'.repeat(40), 'Ab12Cd34Ef', 'Zy98Xw76Vu']) assert.ok(!errs.join('\n').includes(sec)); // ...but never a secret value
  } finally { process.env.NODE_ENV = keep; console.error = ce; }
});
test('MEDIA: svg/html/exe rejected; png accepted and served with nosniff + sandbox CSP + disposition', async () => {
  const up = (type, name) => { const f = new FormData(); f.set('file', new File([new Uint8Array([1, 2, 3])], name, { type })); return upl.POST(new Request('http://localhost/api/upload-local', { method: 'POST', headers: { cookie: A.cookie }, body: f })); };
  for (const [t, nme] of [['image/svg+xml', 'a.svg'], ['text/html', 'a.html'], ['application/x-msdownload', 'a.exe'], ['image/svg+xml;charset=utf-8', 'b.svg'], ['', 'c']]) assert.equal((await up(t, nme)).status, 415, t);
  const ok = await up('image/png', 'a.png'); assert.equal(ok.status, 200);
  const url = (await ok.json()).url;
  const g = await media.GET(mk(url, { cookie: A.cookie, ct: null }));
  assert.equal(g.status, 200); assert.equal(g.headers.get('content-type'), 'image/png');
  assert.equal(g.headers.get('x-content-type-options'), 'nosniff'); assert.match(g.headers.get('content-security-policy'), /sandbox/); assert.match(g.headers.get('content-disposition'), /inline/);
  assert.equal((await media.GET(mk(url))).status, 401);
});
test('MEDIA: traversal / malformed ids are 404; whole media + local upload are closed in production', async () => {
  for (const id of ['../../etc/passwd', '..%2f..%2fetc', 'x', '%00', 'A'.repeat(16)]) assert.equal((await media.GET(mk('/api/media?id=' + id, { cookie: A.cookie, ct: null }))).status, 404);
  const keep = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    assert.equal((await media.GET(mk('/api/media?id=0123456789abcdef', { cookie: A.cookie, ct: null }))).status, 404);
    assert.equal((await upl.POST(mk('/api/upload-local', { method: 'POST', cookie: A.cookie, ct: null }))).status, 404);
  } finally { process.env.NODE_ENV = keep; }
});
test('message media urls: only Vercel Blob https or local media ids are accepted', async () => {
  const post = (url) => msgs.POST(mk('/api/messages', { method: 'POST', cookie: A.cookie, body: { type: 'image', url } }));
  for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'http://x.public.blob.vercel-storage.com/a', 'https://evil.com/?x=.public.blob.vercel-storage.com/', 'https://a.public.blob.vercel-storage.com.evil.com/x', '/api/media?id=../x', '//evil.com', 'https://a.public.blob.vercel-storage.com/x" onerror="y'])
    assert.equal((await post(u)).status, 400, u);
  assert.equal((await post('https://abc123.public.blob.vercel-storage.com/photo-AbC.png')).status, 200);
});
test('blob upload token route: needs a session, rejects bad names, only issues tokens for the allow-list (no SVG)', async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_dummyDummyDummyDummy'; // dummy, offline: token generation is a local signature
  try {
    const body = (pathname) => ({ type: 'blob.generate-client-token', payload: { pathname, callbackUrl: 'http://localhost/api/upload', clientPayload: null, multipart: false } });
    assert.equal((await upload.POST(mk('/api/upload', { method: 'POST', body: body('a.png') }))).status, 401);
    assert.equal((await upload.POST(mk('/api/upload', { method: 'POST', cookie: A.cookie, body: body('../../x.png') }))).status, 400);
    assert.equal((await upload.POST(mk('/api/upload', { method: 'POST', cookie: A.cookie, body: body('a/b.png') }))).status, 400);
    assert.equal((await upload.POST(mk('/api/upload', { method: 'POST', cookie: A.cookie, body: body('x'.repeat(300)) }))).status, 400);
    const ok = await upload.POST(mk('/api/upload', { method: 'POST', cookie: A.cookie, body: body('holiday photo (1).png') }));
    assert.equal(ok.status, 200);
    const j = await ok.json(); assert.equal(j.type, 'blob.generate-client-token');
    const outer = Buffer.from(String(j.clientToken).split('_')[4], 'base64').toString(); // "<signature>.<base64 payload>"
    const info = JSON.parse(Buffer.from(outer.split('.')[1], 'base64').toString());
    assert.ok(info.allowedContentTypes.includes('image/png'));
    assert.ok(!info.allowedContentTypes.some((t) => /svg|html|javascript|\*/i.test(t)));
    assert.equal(info.maximumSizeInBytes, 50 * 1024 * 1024);
    assert.ok(!j.clientToken.includes('dummyDummy')); // the store secret is never echoed back
  } finally { delete process.env.BLOB_READ_WRITE_TOKEN; }
  assert.equal((await upload.POST(mk('/api/upload', { method: 'POST', ct: 'text/plain', raw: 'x' }))).status, 415);
});
test('SECURITY HEADERS configured in next.config.mjs', async () => {
  const cfg = (await import('../next.config.mjs')).default;
  const rules = await cfg.headers();
  const all = Object.fromEntries(rules.find((r) => r.source === '/:path*').headers.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(all['x-content-type-options'], 'nosniff'); assert.equal(all['x-frame-options'], 'DENY');
  assert.match(all['strict-transport-security'], /max-age=\d{7,}/); assert.equal(all['referrer-policy'], 'same-origin');
  for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"]) assert.ok(all['content-security-policy'].includes(d), d);
  assert.ok(!/unsafe-eval/.test(all['content-security-policy']));
  assert.match(all['permissions-policy'], /microphone=\(self\)/); assert.equal(cfg.poweredByHeader, false);
  assert.equal(rules.find((r) => r.source === '/api/:path*').headers[0].value, 'no-store');
});
test('CRON route: 503 in production without secret, 401 with wrong bearer, 200 with the right one', async () => {
  const keep = { e: process.env.NODE_ENV, s: process.env.CRON_SECRET };
  try {
    process.env.NODE_ENV = 'production'; process.env.ALLOW_MEMORY_STORE = '1';
    delete process.env.CRON_SECRET;
    assert.equal((await cron.GET(mk('/api/cron/cleanup', { ct: null }))).status, 503);
    process.env.CRON_SECRET = keep.s;
    assert.equal((await cron.GET(mk('/api/cron/cleanup', { ct: null }))).status, 401);
    const bad = new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer nope' } });
    assert.equal((await cron.GET(bad)).status, 401);
    const good = new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer ' + keep.s } });
    assert.equal((await cron.GET(good)).status, 200);
  } finally { process.env.NODE_ENV = keep.e; process.env.CRON_SECRET = keep.s; delete process.env.ALLOW_MEMORY_STORE; }
});
test('METHODS: only intended HTTP methods are exported (Next.js answers 405 for the rest)', () => {
  assert.deepEqual([login, logout, msgs, call, upl, upload].map((m) => Object.keys(m).sort().join()), Array(6).fill('POST'));
  assert.deepEqual([me, poll, media, cron].map((m) => Object.keys(m).sort().join()), Array(4).fill('GET'));
});
test('NO secret value appears in ANY response body or header we can provoke', async () => {
  const secrets = ['x'.repeat(40), 'Ab12Cd34Ef', 'Zy98Xw76Vu', 'c'.repeat(24)];
  const resps = [
    await login.POST(mk('/api/login', { method: 'POST', body: { code: 'nope000000' } })), await login.POST(mk('/api/login', { method: 'POST', raw: '{' })),
    await me.GET(mk('/api/me', { cookie: A.cookie })), await poll.GET(mk('/api/poll', { cookie: A.cookie })),
    await send(A, { text: '' }), await cron.GET(mk('/api/cron/cleanup', { ct: null })),
  ];
  for (const r of resps) {
    const blob = (await r.text()) + [...r.headers].filter(([k]) => k !== 'set-cookie').map(([k, v]) => k + v).join();
    for (const s of secrets) assert.ok(!blob.includes(s));
  }
});
