import { NextResponse } from 'next/server';
import { authed, names } from '@/lib/auth';
import { hasBlob } from '@/lib/media';
import { safe } from '@/lib/http';

export const GET = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    ice.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return NextResponse.json({ user: ses.u, names: names(), blob: hasBlob, ice }, { headers: { 'cache-control': 'no-store' } });
});
