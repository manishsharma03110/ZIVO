import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { authed } from '@/lib/auth';
import { safe, readJson, fail } from '@/lib/http';
import { ALLOWED_TYPES } from '@/lib/mediatypes';

// Browser uploads straight to Vercel Blob (bypasses the 4.5MB serverless request limit)
export const POST = safe(async (req) => {
  const parsed = await readJson(req, 16 * 1024);
  if (parsed.error) return fail(parsed);
  try {
    const json = await handleUpload({
      body: parsed.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await authed(req))) throw new Error('unauthorized');
        // No path tricks: no directory separators, "..", control characters, or absurd lengths
        if (typeof pathname !== 'string' || !pathname || pathname.length > 200 || /[\/\\\u0000-\u001f]|\.\./.test(pathname)) throw new Error('bad name');
        return {
          allowedContentTypes: ALLOWED_TYPES, // explicit list: SVG / HTML are not allowed
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      // No onUploadCompleted callback: the app does not need it, so Vercel never calls back into this public route
    });
    return NextResponse.json(json);
  } catch (e) {
    if (e && e.name === 'StoreUnavailable') throw e;
    const unauthorized = e && e.message === 'unauthorized';
    return NextResponse.json({ error: unauthorized ? 'unauthorized' : 'Upload could not be started' }, { status: unauthorized ? 401 : 400 });
  }
});
