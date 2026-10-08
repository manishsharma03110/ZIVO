import '@fontsource-variable/dm-sans';
import '@fontsource-variable/source-serif-4';
import './globals.css';

const site = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(site),
  title: 'ZIVO Ration| Fresh Groceries & Daily Essentials Delivered Fast',
  description:
    'Shop fresh groceries and daily essentials with ZIVO Ration. Get everything you need delivered fast, right when you need it.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  verification: {
    google: 'ZZrkSleHno7C4YALGV4L6VJ5isu3xs2XLxGcWkFjFTs',
  },
  openGraph: {
    title: 'ZIVO Ration | Fresh Groceries & Daily Essentials Delivered Fast',
    description: 'Shop fresh groceries and daily essentials with ZIVO Ration. Get everything you need delivered fast, right when you need it.',
    type: 'website',
    url: '/',
  },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#5304b4' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}