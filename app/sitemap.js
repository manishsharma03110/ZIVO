export default function sitemap() {
  const site = process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return [{ url: `${site}/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 }];
}
