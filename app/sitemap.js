import { siteUrl } from '@/lib/seo';

export default function sitemap() {
  const site = siteUrl();
  return [{ url: `${site}/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 }];
}
