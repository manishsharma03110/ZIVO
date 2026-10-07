import crypto from 'crypto';
import { checkConfig, secretValue, codeValue, CODE_RE } from './config.js';
import { kvGet, kvSet } from './store.js';

const COOKIE = 'chat_session';
const MAX_ABS_MS = 12 * 60 * 60 * 1000; // a session can never be kept alive longer than 12h, however long the tab stays open
const MAX_AGE = 120; // 2 min; every poll issues a fresh cookie, so it expires on its own once the client stops

function secret() {
  return secretValue();
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export { CODE_RE };

export function configured() {
  return checkConfig().ok;
}

export function names() {
  return { A: process.env.NAME_A || 'Person A', B: process.env.NAME_B || 'Person B' };
}

// Returns 'A' or 'B' if the code is valid, otherwise null
export function userForCode(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  // Compare against both codes so timing does not reveal which one matched
  const a = safeEqual(c, codeValue('A') || '\u0000');
  const b = safeEqual(c, codeValue('B') || '\u0000');
  return a ? 'A' : b ? 'B' : null;
}

// sid identifies this login so it can be revoked on logout; iat is the original login time (absolute lifetime limit)
export function makeCookieValue(user, { sid, iat } = {}) {
  const payload = Buffer.from(JSON.stringify({ u: user, s: sid || crypto.randomBytes(12).toString('hex'), i: iat || Date.now(), t: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export const cookieOptions = {
  name: COOKIE,
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};

// Verifies signature + expiry only (no network). Returns { u, s, i } or null.
export function getSession(req) {
  if (!secret()) return null;
  const raw = req.headers.get('cookie') || '';
  const m = raw.split(/;\s*/).find((p) => p.startsWith(COOKIE + '='));
  if (!m) return null;
  let val;
  try { val = decodeURIComponent(m.slice(COOKIE.length + 1)); } catch { return null; } // malformed cookie -> treat as logged out, not a 500
  const [payload, sig] = val.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { u, s, i, t } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const now = Date.now();
    if ((u !== 'A' && u !== 'B') || typeof s !== 'string' || !/^[0-9a-f]{24}$/.test(s) || typeof t !== 'number' || typeof i !== 'number') return null;
    if (now - t > MAX_AGE * 1000 || now - i > MAX_ABS_MS || t > now + 60000) return null;
    return { u, s, i };
  } catch {
    return null;
  }
}

export function getUser(req) {
  const s = getSession(req);
  return s ? s.u : null;
}

export const REVOKE_TTL = MAX_AGE + 30;
const revKey = (sid) => 'rev:' + sid;

// Full check: valid signature AND the session has not been revoked by a logout (needs Redis).
// If Redis is unreachable this THROWS, so the route answers with a safe 500 instead of letting a revoked session through.
export async function authed(req) {
  const ses = getSession(req);
  if (!ses) return null;
  if (await kvGet(revKey(ses.s))) return null;
  return ses;
}

export async function revokeSession(sid) {
  await kvSet(revKey(sid), 1, { ex: REVOKE_TTL });
}
export { revKey };

export function other(u) {
  return u === 'A' ? 'B' : 'A';
}
