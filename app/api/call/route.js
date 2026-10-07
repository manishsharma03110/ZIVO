import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { authed, other } from '@/lib/auth';
import { kvGet, kvSet, kvDel } from '@/lib/store';
import { safe, readJson, fail } from '@/lib/http';

const RING_MS = 60000;      // how long a call rings
const HB_TTL = 30;          // seconds a participant heartbeat stays valid
const ACTIVE_GRACE_MS = 40000;

// Accept only a well-formed SDP session description (prevents junk/oversized data being stored)
function cleanSdp(d, type) {
  if (!d || typeof d !== 'object' || d.type !== type || typeof d.sdp !== 'string') return null;
  if (d.sdp.length < 10 || d.sdp.length > 30000) return null;
  return { type, sdp: d.sdp };
}

// An 'active' call whose browsers have both gone away (tab closed, crash, lost network) must not block new calls
async function isBusy(call, now) {
  if (!call) return false;
  if (call.status === 'ringing') return now - call.ts < RING_MS;
  if (call.status !== 'active') return false;
  if (now - (call.answeredAt || call.ts) < ACTIVE_GRACE_MS) return true;
  const [a, b] = await Promise.all([kvGet('hb:A'), kvGet('hb:B')]);
  return a === call.id || b === call.id;
}

// Serialises start/answer/end so two simultaneous requests (e.g. both people calling at the same moment)
// cannot both read "no call" and overwrite each other. The lock key expires by itself after 5s.
async function withLock(fn) {
  for (let i = 0; i < 8; i++) {
    if (await kvSet('call-lock', 1, { ex: 5, nx: true })) {
      try { return await fn(); } finally { await kvDel('call-lock').catch(() => {}); }
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return NextResponse.json({ error: 'busy' }, { status: 409 });
}

// WebRTC signaling: offer/answer pass through here; audio/video goes directly browser-to-browser
export const POST = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = ses.u;
  const parsed = await readJson(req, 96 * 1024);
  if (parsed.error) return fail(parsed);
  const b = parsed.body;

  // Heartbeat while a call is connected (lets the server detect calls abandoned without a clean hang-up). No lock needed.
  if (b.action === 'ping') {
    const call = await kvGet('call');
    if (call && call.status === 'active' && (call.from === me || call.to === me) && b.id === call.id) {
      await kvSet('hb:' + me, call.id, { ex: HB_TTL });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'start') {
    const offer = cleanSdp(b.offer, 'offer');
    if (!offer) return NextResponse.json({ error: 'bad offer' }, { status: 400 });
    return withLock(async () => {
      const call = await kvGet('call'), now = Date.now();
      if (await isBusy(call, now)) return NextResponse.json({ error: 'busy' }, { status: 409 });
      const c = {
        id: crypto.randomBytes(6).toString('hex'), from: me, to: other(me),
        video: !!b.video, offer, status: 'ringing', ts: now,
      };
      await kvSet('call', c, { ex: 120 });
      return NextResponse.json({ ok: true, id: c.id });
    });
  }

  if (b.action === 'answer') {
    const answer = cleanSdp(b.answer, 'answer');
    if (!answer) return NextResponse.json({ error: 'bad answer' }, { status: 400 });
    return withLock(async () => {
      const call = await kvGet('call'), now = Date.now();
      if (!call || call.to !== me || call.status !== 'ringing' || call.id !== b.id) {
        return NextResponse.json({ error: 'no call' }, { status: 404 });
      }
      // The offer is no longer needed once answered; dropping it keeps every poll response small
      await kvSet('call', { ...call, offer: null, answer, status: 'active', answeredAt: now }, { ex: 6 * 3600 });
      return NextResponse.json({ ok: true });
    });
  }

  if (b.action === 'end') {
    return withLock(async () => {
      const call = await kvGet('call'), now = Date.now();
      // An id is required so a late "cancel" can never end a different, newer call
      if (typeof b.id === 'string' && call && (call.from === me || call.to === me) && b.id === call.id) {
        await kvSet('call', { ...call, offer: null, answer: null, status: 'ended', ts: now }, { ex: 20 });
      }
      return NextResponse.json({ ok: true });
    });
  }
  return NextResponse.json({ error: 'bad action' }, { status: 400 });
});
