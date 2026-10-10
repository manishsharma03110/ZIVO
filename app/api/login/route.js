import { NextResponse } from 'next/server';
import { userForCode, makeCookieValue, cookieOptions, CODE_RE } from '@/lib/auth';
import { kvIncr, kvDecr } from '@/lib/store';
import { checkConfig } from '@/lib/config';
import { purgeExpiredMessageMedia } from '@/lib/media';
import { safe, readJson, fail, GENERIC_ERROR } from '@/lib/http';

const MAX_FAILS = 10;
const WINDOW_SEC = 600;

export const POST = safe(async (req) => {
  const cfg = checkConfig();
  if (!cfg.ok) {
    // Details go to the server log (names only, never values); visitors get a generic message in production
    console.error('[config] Server setup is incomplete:', cfg.problems.join('; '));
    const detail = process.env.NODE_ENV === 'production' ? '' : ' (' + cfg.problems.join('; ') + ')';
    return NextResponse.json({ error: GENERIC_ERROR + detail }, { status: 500 });
  }
  const parsed = await readJson(req, 1024);
  if (parsed.error) return fail(parsed);
  // Anything that is not exactly 10 characters can never be valid, so it is rejected without counting as a guess
  const code = typeof parsed.body.code === 'string' ? parsed.body.code : '';
  if (!CODE_RE.test(code)) return NextResponse.json({ error: 'Please enter your 10-character access code.' }, { status: 400 });

  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim().slice(0, 64);
  const rlKey = 'rl:' + ip;
  // Atomic: reserve an attempt FIRST (INCR is atomic), then verify. A burst of parallel guesses can therefore
  // never get more than MAX_FAILS tries. A successful login refunds its attempt so real users are never locked out.
  const n = await kvIncr(rlKey, WINDOW_SEC);
  if (n > MAX_FAILS) return NextResponse.json({ error: 'Too many attempts. Please try again in 10 minutes.' }, { status: 429 });

  const user = userForCode(code);
  if (!user) return NextResponse.json({ error: 'Incorrect code' }, { status: 401 });
  await kvDecr(rlKey);
  await purgeExpiredMessageMedia().catch(() => {});

  const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  const { name, ...opts } = cookieOptions;
  res.cookies.set(name, makeCookieValue(user), opts); // always a NEW session id (no session fixation)
  return res;
});
