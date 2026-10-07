// Test-only resolver: supports the "@/" alias and extensionless relative imports used by Next.js code.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withExt = (p) => (existsSync(p) ? p : existsSync(p + '.js') ? p + '.js' : existsSync(p + '/route.js') ? p + '/route.js' : p);
export async function resolve(spec, ctx, next) {
  if (spec === 'next/server') return next('next/server.js', ctx);
  if (spec.startsWith('@/')) return next(pathToFileURL(withExt(path.join(root, spec.slice(2)))).href, ctx);
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:') && !ctx.parentURL.includes('node_modules')) {
    const abs = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    if (!path.extname(abs)) return next(pathToFileURL(withExt(abs)).href, ctx);
  }
  return next(spec, ctx);
}
