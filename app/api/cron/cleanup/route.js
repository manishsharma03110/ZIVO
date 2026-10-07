import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { deleteOldBlobs, purgeOldMessages } from '@/lib/media';
import { safe } from '@/lib/http';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export const GET = safe(async (req) => {
  const secret = (process.env.CRON_SECRET || '').trim();
  // The route is closed unless CRON_SECRET is set (Vercel Cron sends it automatically as a Bearer token)
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (secret && !same(req.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const removed = await deleteOldBlobs();
  const purged = await purgeOldMessages();
  return NextResponse.json({ ok: true, removed, purged });
});
