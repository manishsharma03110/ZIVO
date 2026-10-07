import { NextResponse } from 'next/server';
import { authed } from '@/lib/auth';
import { memMedia, prodLike } from '@/lib/store';
import { safe } from '@/lib/http';
import { SAFE_TYPES } from '@/lib/mediatypes';

// Local-development media only (production uses Vercel Blob). Never available on Vercel / in production.
export const GET = safe(async (req) => {
  if (prodLike()) return new NextResponse('not found', { status: 404 });
  if (!(await authed(req))) return new NextResponse('unauthorized', { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const m = /^[a-f0-9]{16}$/.test(id) ? memMedia.get(id) : null; // fixed-format id: no path traversal possible
  if (!m || !SAFE_TYPES.has(m.type)) return new NextResponse('gone', { status: 404 });
  return new NextResponse(m.buf, { headers: {
    'content-type': m.type,
    'content-disposition': 'inline; filename="media"',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
  } });
});
