import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMetadata, siteUrl } from '../lib/seo.js';
import robots from '../app/robots.js';
import sitemap from '../app/sitemap.js';
import config from '../next.config.mjs';

test('SEO metadata includes canonical, social cards, English page language and Search Console verification', () => {
  const metadata = createMetadata({ NEXT_PUBLIC_SITE_URL: 'https://chat.example.test' });
  assert.equal(metadata.metadataBase.href, 'https://chat.example.test/');
  assert.equal(metadata.alternates.canonical, '/');
  assert.ok(metadata.title);
  assert.ok(metadata.description);
  assert.equal(metadata.openGraph.url, '/');
  assert.equal(metadata.twitter.card, 'summary_large_image');
  assert.ok(metadata.verification.google);
  assert.deepEqual(createMetadata({ NEXT_PUBLIC_SITE_URL: 'https://chat.example.test' }, { privateView: true }).robots, { index: false, follow: false });
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://public.example.test', SITE_URL: 'https://legacy.example.test' }), 'https://public.example.test');
});

test('server-rendered splash provides the existing text as an H1 without changing its text or class', async () => {
  const splash = await readFile(new URL('../app/components/SplashScreen.js', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../app/layout.js', import.meta.url), 'utf8');
  assert.match(splash, /<h1 className="tag">Everything, Right When<br \/>You Need It<\/h1>/);
  assert.match(layout, /<html lang="en">/);
  assert.match(layout, /themeColor: '#5304b4'/);
});

test('robots allows the public root, disallows APIs and private paths, and advertises the absolute sitemap', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://chat.example.test';
  try {
    const result = robots();
    assert.deepEqual(result.rules[0], { userAgent: '*', allow: '/', disallow: ['/api/', '/chat/', '/private/'] });
    assert.equal(result.sitemap, 'https://chat.example.test/sitemap.xml');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test('sitemap contains only the absolute public root URL', () => {
  const entries = sitemap();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, `${siteUrl()}/`);
});

test('API responses carry noindex and nofollow robot directives', async () => {
  const headers = await config.headers();
  const api = headers.find((entry) => entry.source === '/api/:path*');
  assert.ok(api.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'));
});
