import { after, NextResponse } from 'next/server';
import crypto from 'crypto';
import { authed } from '@/lib/auth';
import { listPush, kvSet, kvGet, kvDel } from '@/lib/store';
import { MEDIA_TTL_MS, purgeExpiredMessageMedia } from '@/lib/media';
import { safe, readJson, fail } from '@/lib/http';

const OK_URL = /^(https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>\\]{1,400}$|\/api\/media\?id=[a-f0-9]{16}$)/i;
const CID = /^[A-Za-z0-9-]{8,64}$/;

// Truncate by Unicode characters (not UTF-16 units) so emoji and Indic/CJK text are never cut in half
const clip = (v, n) => Array.from(String(v == null ? '' : v)).slice(0, n).join('');

export const POST = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = ses.u; // identity comes ONLY from the signed cookie, never from the request body
  const parsed = await readJson(req, 32 * 1024);
  if (parsed.error) return fail(parsed);
  const b = parsed.body;

  // The client states who it believes it is. If the shared session cookie now belongs to someone else
  // (e.g. both people signed in from the same browser), refuse instead of storing the message under the wrong sender.
  if (b.as !== undefined && b.as !== me) return NextResponse.json({ error: 'session changed' }, { status: 409, headers: { 'cache-control': 'no-store' } });

  const now = Date.now();
  const msg = { id: `${now}-${crypto.randomBytes(3).toString('hex')}`, from: me, createdAt: now };

  if (b.type === 'text') {
    const text = clip(b.text, 2000).trim();
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
    // reply.from is the real author (A/B) of the quoted message; reply.who is kept only for older clients
    const rp = b.reply && typeof b.reply === 'object' ? { who: clip(b.reply.who, 30), text: clip(b.reply.text, 120), ...(b.reply.from === 'A' || b.reply.from === 'B' ? { from: b.reply.from } : {}) } : null;
    Object.assign(msg, { type: 'text', text, ...(rp && rp.text ? { reply: rp } : {}) });
  } else if (b.type === 'call') {
    const status = ['done', 'missed', 'declined', 'cancelled'].includes(b.status) ? b.status : 'cancelled';
    Object.assign(msg, { type: 'call', video: !!b.video, status, dur: Math.max(0, Math.min(86400, Math.round(Number(b.dur) || 0))) });
  } else if (b.type === 'image' || b.type === 'video' || b.type === 'voice') {
    if (!OK_URL.test(String(b.url || ''))) return NextResponse.json({ error: 'bad url' }, { status: 400 });
    Object.assign(msg, { type: b.type, url: b.url, expiresAt: now + MEDIA_TTL_MS, ...(b.type === 'voice' ? { dur: Math.max(1, Math.min(600, Math.round(Number(b.dur) || 1))) } : {}) });
  } else {
    return NextResponse.json({ error: 'bad type' }, { status: 400 });
  }

  // Idempotency: a retry of the same client message (same cid) never creates a duplicate.
  // The marker is claimed atomically (SET NX) before storing, and released again if storing fails so the retry can succeed.
  const cid = typeof b.cid === 'string' && CID.test(b.cid) ? 'cid:' + me + ':' + b.cid : '';
  if (cid) {
    const claimed = await kvSet(cid, msg.id, { ex: 600, nx: true });
    if (!claimed) return NextResponse.json({ ok: true, duplicate: true, id: (await kvGet(cid)) || undefined });
  }
  try {
    await listPush('msgs', msg, 300, 'msgs:last');
  } catch (e) {
    if (cid) await kvDel(cid).catch(() => {});
    throw e;
  }
  const cleanup = () => purgeExpiredMessageMedia().catch(() => {});
  try { after(cleanup); } catch { await cleanup(); }
  return NextResponse.json({ ok: true, id: msg.id, from: me }, { headers: { 'cache-control': 'no-store' } });
});
