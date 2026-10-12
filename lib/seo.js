export function siteUrl(env = process.env) {
  const configured = env.NEXT_PUBLIC_SITE_URL || env.SITE_URL;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  return configured || vercel || 'http://localhost:3000';
}

export function createMetadata(env = process.env, { privateView = false } = {}) {
  const title = 'ZIVO Ration | Fresh Groceries & Daily Essentials Delivered Fast';
  const description = 'Shop fresh groceries and daily essentials with ZIVO Ration. Get everything you need delivered fast, right when you need it.';
  return {
    metadataBase: new URL(siteUrl(env)),
    title,
    description,
    alternates: { canonical: '/' },
    robots: { index: !privateView, follow: !privateView },
    verification: {
      google: 'ZZrkSleHno7C4YALGV4L6VJ5isu3xs2XLxGcWkFjFTs',
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
