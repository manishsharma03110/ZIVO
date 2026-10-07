import { NextResponse } from 'next/server';
import { cookieOptions, getSession, revokeSession } from '@/lib/auth';
import { safe } from '@/lib/http';

export const POST = safe(async (req) => {
  // Server-side revocation: the session id is blacklisted in Redis for as long as the cookie could still be valid
  const ses = getSession(req);
  const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  res.cookies.set(cookieOptions.name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'strict', secure: cookieOptions.secure });
  if (ses) await revokeSession(ses.s);
  return res;
});
