import { NextResponse } from 'next/server';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Wraps a route handler: any unexpected exception (Redis down, bug, ...) becomes a generic 500.
// Details (name + message only, never request data or secrets) go to the server log.
export const safe = (fn) => async (req, ctx) => {
  try {
    return await fn(req, ctx);
  } catch (e) {
    let path = '';
    try { path = new URL(req.url).pathname; } catch {}
    console.error('[api]', req && req.method, path, e && e.name, e && e.message);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
};

// Reads a JSON object body with a content-type check and a hard size limit.
// Returns { body } or { error, status }.
export async function readJson(req, max = 32 * 1024) {
  const ct = req.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(ct)) return { error: 'unsupported media type', status: 415 };
  const len = Number(req.headers.get('content-length'));
  if (Number.isFinite(len) && len > max) return { error: 'payload too large', status: 413 };
  let text;
  try { text = await req.text(); } catch { return { error: 'bad request', status: 400 }; }
  if (text.length > max) return { error: 'payload too large', status: 413 };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad request', status: 400 };
    return { body };
  } catch {
    return { error: 'bad request', status: 400 };
  }
}

export const fail = (r) => NextResponse.json({ error: r.error }, { status: r.status });
