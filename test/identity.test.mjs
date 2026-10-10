import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu', NODE_ENV: 'test' });
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL;
const R = (p) => import('../app/api/' + p + '/route.js');
const login = await R('login'), poll = await R('poll'), msgs = await R('messages');
const { normalizeMessages, quotedAuthor, setOptimisticStatus, optimisticRetryLabel } = await import('../lib/messages.js');

let ipN = 100;
const mk = (url, { method = 'GET', body, cookie } = {}) => new Request('http://localhost' + url, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), 'x-forwarded-for': `10.9.0.${++ipN}` },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const signIn = async (code) => (await login.POST(mk('/api/login', { method: 'POST', body: { code } }))).headers.get('set-cookie').split(';')[0];
const A = await signIn('Ab12Cd34Ef'), B = await signIn('Zy98Xw76Vu');
const send = (cookie, body) => msgs.POST(mk('/api/messages', { method: 'POST', cookie, body: { type: 'text', ...body } }));
const all = async (cookie) => (await (await poll.GET(mk('/api/poll', { cookie }))).json());

test('every stored message keeps its real sender; both people see identical history (tests 1-4, 8)', async () => {
  const plan = [[A, 'Hello', 'A'], [B, 'Hi', 'B'], [A, 'How are you?', 'A'], [B, "I'm good.", 'B'], [B, 'second from B', 'B'], [B, 'third from B', 'B'], [A, 'one', 'A'], [A, 'two', 'A'], [A, 'three', 'A']];
  for (const [who, text] of plan) assert.equal((await send(who, { text })).status, 200);
  const fromA = await all(A), fromB = await all(B);
  const tail = (d) => d.messages.slice(-plan.length).map((m) => [m.text, m.from]);
  assert.deepEqual(tail(fromA), plan.map(([, t, f]) => [t, f]));
  assert.deepEqual(tail(fromA), tail(fromB)); // same history, same attribution for both viewers
  assert.equal(fromA.me, 'A'); assert.equal(fromB.me, 'B'); // poll reports the authoritative identity
});

test('rapid sends from both users: no mixing, no duplicates, unique ids (test 7)', async () => {
  const N = 40;
  await Promise.all(Array.from({ length: N }, (_, i) => send(i % 3 ? A : B, { text: 'rapid ' + i })));
  const d = await all(A);
  const rapid = d.messages.filter((m) => m.text.startsWith('rapid '));
  assert.equal(rapid.length, N);
  assert.equal(new Set(rapid.map((m) => m.id)).size, N);
  for (const m of rapid) assert.equal(m.from, Number(m.text.slice(6)) % 3 ? 'A' : 'B');
});

test('a tab that believes it is A cannot post as B when the shared cookie belongs to B (409, nothing stored)', async () => {
  const before = (await all(B)).messages.length;
  const r = await send(B, { text: 'stale tab', as: 'A' });
  assert.equal(r.status, 409);
  assert.equal((await all(B)).messages.length, before);
  assert.equal((await send(B, { text: 'right tab', as: 'B' })).status, 200);
});

test('reply quote records the real author, so both people read it correctly', async () => {
  const first = await (await send(A, { text: 'question from A' })).json();
  assert.equal(first.from, 'A');
  await send(B, { text: 'answer', reply: { from: 'A', who: 'Alice', text: 'question from A' } });
  const m = (await all(A)).messages.find((x) => x.text === 'answer');
  assert.equal(m.reply.from, 'A');
  assert.equal(quotedAuthor(m), 'A');
  assert.equal(quotedAuthor({ from: 'B', reply: { from: 'junk' } }), 'A'); // invalid from is ignored by the server; legacy rule applies
});

test('legacy replies (no reply.from) resolve exactly from the old viewer-relative label', () => {
  assert.equal(quotedAuthor({ from: 'A', reply: { who: 'You', text: 'x' } }), 'A'); // replier quoted themself
  assert.equal(quotedAuthor({ from: 'A', reply: { who: 'Bob', text: 'x' } }), 'B'); // replier quoted the other person
  assert.equal(quotedAuthor({ from: 'B', reply: { who: 'You', text: 'x' } }), 'B');
  assert.equal(quotedAuthor({ from: 'B', reply: { who: 'Ann', text: 'x' } }), 'A');
  assert.equal(quotedAuthor({ from: 'A' }), null);
});

test('normalizeMessages keeps server order, drops unattributed and duplicate messages', () => {
  const out = normalizeMessages([
    { id: '2-a', from: 'B', text: 'b' }, { id: '1-a', from: 'A', text: 'a' }, { id: '1-a', from: 'A', text: 'dup' },
    { id: '3-a', text: 'no sender' }, { id: '4-a', from: 'C', text: 'bad sender' }, null, { from: 'A' },
  ]);
  assert.deepEqual(out.map((m) => m.id), ['2-a', '1-a']); // not re-sorted by id/timestamp, not reordered by position
  assert.deepEqual(normalizeMessages(null), []);
});

test('failed optimistic message stays visible with retry and retains its cid', () => {
  const cid = 'retry-client-id';
  const original = { id: 'pending:' + cid, from: 'A', type: 'text', text: 'retry me', cid, pending: true, status: 'sending' };
  const failed = setOptimisticStatus([original], cid, 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, 'failed');
  assert.equal(failed[0].pending, false);
  assert.equal(optimisticRetryLabel(failed[0]), 'Retry');
  const retried = setOptimisticStatus(failed, cid, 'sending');
  assert.equal(retried.length, 1);
  assert.equal(retried[0].cid, cid);
  assert.equal(retried[0].pending, true);
  assert.equal(optimisticRetryLabel(retried[0]), null);
});
