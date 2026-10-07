export default function robots() {
  const site = process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return { rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }], sitemap: `${site}/sitemap.xml` };
}
