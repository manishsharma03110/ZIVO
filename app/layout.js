import '@fontsource-variable/dm-sans';
import '@fontsource-variable/source-serif-4';
import './globals.css';

const site = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(site),
  title: 'Morning: Secure Code-Login Chat, Photos & Video Calls',
  description:
    'Morning is a simple, secure two-person chat with secret-code login, photo and video sharing that auto-deletes in 24 hours, and voice and video calls right in your browser.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Morning: Secure Code-Login Chat, Photos & Video Calls',
    description: 'Secret-code login, auto-deleting photos and videos, and browser voice and video calls.',
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
