import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu', NODE_ENV: 'test', NAME_A: 'Asha', NAME_B: 'Ben' });
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL;
delete process.env.STT_API_KEY; delete process.env.OPENAI_API_KEY;
const R = (p) => import('../app/api/' + p + '/route.js');
const login = await R('login'), me = await R('me'), profile = await R('profile'), tr = await R('transcribe');

let n = 0;
const mk = (url, { method = 'GET', body, cookie, json = true } = {}) => new Request('http://localhost' + url, {
  method, headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), 'x-forwarded-for': `10.1.0.${++n}` },
  body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
});
const signIn = async (code) => (await login.POST(mk('/api/login', { method: 'POST', body: { code } }))).headers.get('set-cookie').split(';')[0];
const A = await signIn('Ab12Cd34Ef'), B = await signIn('Zy98Xw76Vu');
const PIX = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

test('profile: requires login', async () => {
  assert.equal((await profile.GET(mk('/api/profile'))).status, 401);
  assert.equal((await profile.POST(mk('/api/profile', { method: 'POST', body: { name: 'x' } }))).status, 401);
});
test('profile: defaults come from the environment names', async () => {
  const d = await (await profile.GET(mk('/api/profile', { cookie: A }))).json();
  assert.equal(d.profiles.A.name, 'Asha'); assert.equal(d.profiles.B.name, 'Ben'); assert.equal(d.profiles.A.photo, '');
});
test('profile: save name, bio and photo; the other person sees it; photo is served', async () => {
  const r = await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { as: 'A', name: '  Asha K  ', bio: 'Hello there', photo: PIX } }));
  assert.equal(r.status, 200);
  const d = await (await profile.GET(mk('/api/profile', { cookie: B }))).json();
  assert.equal(d.profiles.A.name, 'Asha K'); assert.equal(d.profiles.A.bio, 'Hello there');
  assert.match(d.profiles.A.photo, /^\/api\/profile\?photo=A&v=\d+$/);
  const img = await profile.GET(mk(d.profiles.A.photo, { cookie: B }));
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await img.arrayBuffer()).toString(), 'fake-jpeg-bytes');
  assert.equal((await profile.GET(mk('/api/profile?photo=A'))).status, 401);
});
test('profile: a person can only change their own profile', async () => {
  assert.equal((await profile.POST(mk('/api/profile', { method: 'POST', cookie: B, body: { as: 'A', name: 'Hacked' } }))).status, 409);
  await profile.POST(mk('/api/profile', { method: 'POST', cookie: B, body: { name: 'Ben R' } }));
  const d = await (await profile.GET(mk('/api/profile', { cookie: A }))).json();
  assert.equal(d.profiles.A.name, 'Asha K'); assert.equal(d.profiles.B.name, 'Ben R');
});
test('profile: omitting photo keeps it, null removes it, bad images are refused, empty name falls back', async () => {
  await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { name: 'Asha K', bio: 'x' } }));
  assert.match((await (await profile.GET(mk('/api/profile', { cookie: A }))).json()).profiles.A.photo, /photo=A/);
  assert.equal((await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { name: 'a', photo: 'data:text/html;base64,PGI+' } }))).status, 400);
  assert.equal((await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { name: 'a', photo: 'data:image/jpeg;base64,' + 'A'.repeat(91000) } }))).status, 400);
  await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { name: '', bio: '', photo: null } }));
  const d = (await (await profile.GET(mk('/api/profile', { cookie: A }))).json()).profiles.A;
  assert.equal(d.name, 'Asha'); assert.equal(d.photo, '');
});
test('profile: name and bio are length-limited', async () => {
  await profile.POST(mk('/api/profile', { method: 'POST', cookie: A, body: { name: 'N'.repeat(100), bio: 'B'.repeat(500) } }));
  const d = (await (await profile.GET(mk('/api/profile', { cookie: A }))).json()).profiles.A;
  assert.equal(d.name.length, 30); assert.equal(d.bio.length, 120);
});

const audio = (type = 'audio/webm', size = 3000) => { const fd = new FormData(); fd.append('audio', new Blob([new Uint8Array(size)], { type }), 'speech'); return fd; };
test('transcribe: requires login, and is off (503) without a key; /api/me reports stt=false', async () => {
  assert.equal((await tr.POST(mk('/api/transcribe', { method: 'POST', body: audio(), json: false }))).status, 401);
  assert.equal((await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio(), json: false }))).status, 503);
  assert.equal((await (await me.GET(mk('/api/me', { cookie: A }))).json()).stt, false);
});
test('transcribe: with a key it forwards audio, never leaks the key, validates input and rate-limits', async () => {
  process.env.STT_API_KEY = 'sk-test-secret'; process.env.STT_API_URL = 'https://stt.example/v1/audio/transcriptions';
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, auth: init.headers.authorization, model: init.body.get('model'), prompt: init.body.get('prompt'), file: init.body.get('file') }; return new Response(JSON.stringify({ text: ' Kal mujhe office jana hai and please remind me at 10 AM ' }), { status: 200 }); };
  try {
    const m = await (await me.GET(mk('/api/me', { cookie: A }))).text();
    assert.equal(JSON.parse(m).stt, true); assert.ok(!m.includes('sk-test-secret'));
    const r = await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio(), json: false }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).text, 'Kal mujhe office jana hai and please remind me at 10 AM');
    assert.equal(seen.url, 'https://stt.example/v1/audio/transcriptions'); assert.equal(seen.auth, 'Bearer sk-test-secret');
    assert.equal(seen.model, 'gpt-4o-transcribe'); assert.match(seen.prompt, /Hinglish/); assert.ok(seen.file.size === 3000);
    const unsupported = await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio('text/plain'), json: false }));
    assert.equal(unsupported.status, 415); assert.match((await unsupported.json()).error, /not supported/i);
    assert.equal((await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio('audio/webm', 4_100_000), json: false }))).status, 413);
    const empty = await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio('audio/webm', 50), json: false }));
    assert.equal(empty.status, 400); assert.match((await empty.json()).error, /empty/i);
    const nofile = await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: (() => { const f = new FormData(); f.append('other', 'x'); return f; })(), json: false }));
    assert.equal(nofile.status, 400);
    assert.equal(seen.file.size, 3000, 'rejected requests never reached the upstream service');
    globalThis.fetch = async () => new Response('boom', { status: 500 });
    const bad = await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: A, body: audio(), json: false }));
    assert.equal(bad.status, 502); assert.ok(!(await bad.text()).includes('boom'));
    let last; for (let i = 0; i < 25; i++) last = (await tr.POST(mk('/api/transcribe', { method: 'POST', cookie: B, body: audio(), json: false }))).status;
    assert.equal(last, 429);
  } finally { globalThis.fetch = real; delete process.env.STT_API_KEY; delete process.env.STT_API_URL; }
});
