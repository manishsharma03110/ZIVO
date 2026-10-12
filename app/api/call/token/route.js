import { NextResponse } from 'next/server';
import { authed } from '@/lib/auth';
import { kvGet } from '@/lib/store';
import { STRINGS } from '@/lib/strings';
import { safe } from '@/lib/http';
import { canJoinCall, liveKitConfigured } from '@/lib/livekit';
import { createLiveKitCredentials } from '@/lib/livekit-server';

export function createTokenRoute({ tokenIssuer = createLiveKitCredentials } = {}) {
  return safe(async (req) => {
    const session = await authed(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
    if (!liveKitConfigured()) {
      return NextResponse.json({ error: STRINGS.calls.unavailable }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }

    const call = await kvGet('call');
    if (!canJoinCall(call, session.u)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'no-store' } });
    }
    const credentials = await tokenIssuer(call.id, session.u);
    if (!credentials) {
      return NextResponse.json({ error: STRINGS.calls.unavailable }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return NextResponse.json(credentials, { headers: { 'cache-control': 'no-store' } });
  });
}

export const GET = createTokenRoute();
