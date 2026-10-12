import { siteUrl } from '@/lib/seo';

export default function robots() {
  const site = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/chat/', '/private/'] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
