import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SESSION_SECRET: 'x'.repeat(40), CODE_A: 'Ab12Cd34Ef', CODE_B: 'Zy98Xw76Vu' });
const { userForCode, makeCookieValue, getUser, other } = await import('../lib/auth.js');
const req = (cookie) => ({ headers: new Headers(cookie ? { cookie } : {}) });
const ck = (v) => `chat_session=${encodeURIComponent(v)}`;

test('valid codes map to users', () => { assert.equal(userForCode('Ab12Cd34Ef'), 'A'); assert.equal(userForCode('Zy98Xw76Vu'), 'B'); });
test('invalid / empty / case-changed codes rejected', () => { for (const c of ['', 'nope', 'ab12cd34ef', null, undefined, {}]) assert.equal(userForCode(c), null); });
test('signed cookie round-trips', () => assert.equal(getUser(req(ck(makeCookieValue('A')))), 'A'));
test('no cookie -> logged out', () => assert.equal(getUser(req()), null));
test('tampered signature rejected', () => { const v = makeCookieValue('A'); assert.equal(getUser(req(ck(v.slice(0, -2) + 'xx'))), null); });
test('forged payload (A -> B) with old signature rejected', () => {
  const [p, s] = makeCookieValue('A').split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'B', t: Date.now() })).toString('base64url');
  assert.equal(getUser(req(ck(forged + '.' + s))), null);
});
test('unsigned / alg-none style cookie rejected', () => assert.equal(getUser(req(ck(Buffer.from('{"u":"A","t":1}').toString('base64url') + '.'))), null));
test('expired session rejected', () => {
  const real = Date.now; const v = makeCookieValue('A');
  Date.now = () => real() + 121_000;
  try { assert.equal(getUser(req(ck(v))), null); } finally { Date.now = real; }
});
test('malformed cookie encoding does not throw', () => assert.equal(getUser(req('chat_session=%E0%A4%A')), null));
test('cookie signed with another secret rejected', async () => {
  const v = makeCookieValue('A'); process.env.SESSION_SECRET = 'y'.repeat(40);
  try { assert.equal(getUser(req(ck(v))), null); } finally { process.env.SESSION_SECRET = 'x'.repeat(40); }
});
test('short SESSION_SECRET disables sessions entirely', () => {
  const v = makeCookieValue('A'); process.env.SESSION_SECRET = 'short';
  try { assert.equal(getUser(req(ck(v))), null); } finally { process.env.SESSION_SECRET = 'x'.repeat(40); }
});
test('other()', () => { assert.equal(other('A'), 'B'); assert.equal(other('B'), 'A'); });
