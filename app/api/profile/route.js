import { NextResponse } from 'next/server';
import { authed, names } from '@/lib/auth';
import { kvGet, kvMget, kvSet } from '@/lib/store';
import { safe, readJson, fail } from '@/lib/http';

// Each of the two people can edit their own name, bio and photo. Identity comes only from the signed session cookie.
// The photo is a small (about 256 px) image stored as a data URL in Redis and served from ?photo=A|B, so it never
// expires with the 24-hour media cleanup and needs no Blob storage.
const clip = (v, n) => Array.from(String(v == null ? '' : v)).slice(0, n).join('').trim();
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO = 90000; // characters of the data URL

async function view() {
  const [a, b] = await kvMget(['profile:A', 'profile:B']);
  const base = names();
  const one = (u, p) => {
    const d = p && typeof p === 'object' ? p : {};
    return { name: d.name || base[u], bio: d.bio || '', photo: d.pv ? `/api/profile?photo=${u}&v=${d.pv}` : '' };
  };
  return { A: one('A', a), B: one('B', b) };
}

export const GET = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const u = new URL(req.url).searchParams.get('photo');
  if (u === 'A' || u === 'B') {
    const data = await kvGet('profile:photo:' + u);
    const m = typeof data === 'string' && /^data:(image\/[a-z]+);base64,(.+)$/.exec(data);
    if (!m) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }
  return NextResponse.json({ profiles: await view() }, { headers: { 'cache-control': 'no-store' } });
});

export const POST = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = ses.u;
  const parsed = await readJson(req, 140 * 1024);
  if (parsed.error) return fail(parsed);
  const b = parsed.body;
  if (b.as !== undefined && b.as !== me) return NextResponse.json({ error: 'session changed' }, { status: 409 });

  const cur = (await kvGet('profile:' + me)) || {};
  const next = { name: clip(b.name, 30), bio: clip(b.bio, 120), pv: cur.pv || 0 };
  // photo: undefined = keep, null = remove, data URL = replace
  if (b.photo === null) { next.pv = 0; }
  else if (typeof b.photo === 'string') {
    if (!IMG.test(b.photo) || b.photo.length > MAX_PHOTO) return NextResponse.json({ error: 'That photo is not valid or is too large.' }, { status: 400 });
    next.pv = Date.now();
    await kvSet('profile:photo:' + me, b.photo);
  } else if (b.photo !== undefined) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  await kvSet('profile:' + me, next);
  return NextResponse.json({ ok: true, profiles: await view() }, { headers: { 'cache-control': 'no-store' } });
});
