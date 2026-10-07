import { NextResponse } from 'next/server';
import { getSession, makeCookieValue, cookieOptions, other } from '@/lib/auth';
import { kvMget, kvSet, listLast } from '@/lib/store';
import { deleteMedia, purgeOldMessages, MESSAGE_TTL_MS } from '@/lib/media';
import { safe } from '@/lib/http';

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

export const GET = safe(async (req) => {
  const ses = getSession(req);
  if (!ses) return unauthorized();
  const me = ses.u;
  const sp = new URL(req.url).searchParams;
  const since = (sp.get('since') || '').slice(0, 64);
  const ack = (sp.get('ack') || '').slice(0, 64); // call id whose answer this client has already applied

  // ONE Redis round trip answers: newest message id, current call, the other person's read receipt, and revocation.
  // While nothing changed this is the only command a poll costs.
  const [last, call, peerSeen, revoked] = await kvMget(['msgs:last', 'call', 'seen:' + other(me), 'rev:' + ses.s]);
  if (revoked) return unauthorized();

  // Read receipt: remember the newest message this user has actually seen (only a plain id is accepted)
  const seen = sp.get('seen') || '';
  if (/^\d{10,16}-[0-9a-f]{6}$/.test(seen)) await kvSet('seen:' + me, seen);

  const now = Date.now();
  let out = null, lastId = since;
  if (!(typeof last === 'string' && last && last === since)) {
    const all = await listLast('msgs', 100);
    // Retention: hide messages past MESSAGE_TTL_DAYS (and purge them from storage below)
    const cutoff = MESSAGE_TTL_MS ? now - MESSAGE_TTL_MS : 0;
    const msgs = cutoff ? all.filter((m) => m.createdAt >= cutoff) : all;
    lastId = msgs.length ? msgs[msgs.length - 1].id : '';

    // Delete expired media (at most once every 5 minutes)
    const expired = msgs.filter((m) => m.url && m.expiresAt && m.expiresAt < now);
    const hasOld = !!cutoff && all.length > 0 && all[0].createdAt < cutoff;
    if ((expired.length || hasOld) && (await kvSet('cleanup-lock', 1, { ex: 300, nx: true }))) {
      if (expired.length) await deleteMedia(expired.map((m) => m.url));
      if (hasOld) await purgeOldMessages();
    }
    if (lastId !== since) out = msgs.map((m) => (m.expiresAt && m.expiresAt < now ? { ...m, url: null, expired: true } : m));
  }

  let publicCall = null;
  if (call && typeof call === 'object') {
    publicCall = {
      id: call.id, from: call.from, to: call.to, video: call.video, status: call.status,
      age: now - call.ts,
      // Heavy SDP blobs are sent only while needed: the offer while ringing, the answer until the caller acknowledges it
      offer: call.to === me && call.status === 'ringing' ? call.offer : undefined,
      answer: call.from === me && ack !== call.id ? call.answer : undefined,
    };
  }

  const res = NextResponse.json(
    { me, lastId, now, messages: out, call: publicCall, peerSeen: typeof peerSeen === 'string' ? peerSeen : '' },
    { headers: { 'cache-control': 'no-store' } }
  );
  // Sliding session (renewed while the tab stays open), same session id and original login time, so the 12h cap still applies
  const { name, ...opts } = cookieOptions;
  res.cookies.set(name, makeCookieValue(me, { sid: ses.s, iat: ses.i }), opts);
  return res;
});
