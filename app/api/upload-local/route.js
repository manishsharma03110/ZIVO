import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { authed } from '@/lib/auth';
import { memMedia, prodLike } from '@/lib/store';
import { safe } from '@/lib/http';
import { SAFE_TYPES } from '@/lib/mediatypes';

// For local testing only (used when no Blob token is configured). Closed on Vercel / in production.
export const POST = safe(async (req) => {
  if (prodLike()) return NextResponse.json({ error: 'not available' }, { status: 404 });
  if (!(await authed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'use blob' }, { status: 400 });
  const len = Number(req.headers.get('content-length'));
  if (Number.isFinite(len) && len > 51 * 1024 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad form' }, { status: 400 }); }
  const file = form.get('file');
  const type = file && typeof file !== 'string' ? String(file.type).split(';')[0].toLowerCase() : '';
  if (!SAFE_TYPES.has(type)) return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const id = crypto.randomBytes(8).toString('hex');
  memMedia.set(id, { buf: Buffer.from(await file.arrayBuffer()), type, at: Date.now() });
  return NextResponse.json({ url: `/api/media?id=${id}` });
});
