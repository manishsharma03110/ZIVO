import { NextResponse } from 'next/server';
import { authed } from '@/lib/auth';
import { STRINGS } from '@/lib/strings';
import { safe } from '@/lib/http';
import { createChatTokenRequest } from '@/lib/realtime-server';

export const GET = safe(async (req) => {
  const ses = await authed(req);
  if (!ses) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

  const tokenRequest = await createChatTokenRequest();
  if (!tokenRequest) {
    return NextResponse.json(
      { enabled: false, error: STRINGS.realtime.disabled },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }

  return NextResponse.json(tokenRequest, { headers: { 'cache-control': 'no-store' } });
});
