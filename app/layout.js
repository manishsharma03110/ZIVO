import '@fontsource-variable/dm-sans';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/auth';
import { createMetadata } from '@/lib/seo';

export async function generateMetadata() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('chat_session');
  const request = sessionCookie
    ? new Request('https://zivo-metadata.invalid', {
      headers: { cookie: `chat_session=${encodeURIComponent(sessionCookie.value)}` },
    })
    : null;
  return createMetadata(process.env, { privateView: !!(request && getUser(request)) });
}

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#5304b4' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}