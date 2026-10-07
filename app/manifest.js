// Lets the site be added to the phone's home screen like an app (name, colours and icons).
export default function manifest() {
  return {
    name: 'ZIVO',
    short_name: 'ZIVO',
    description: 'Fresh groceries, daily essentials, delivered fast.',
    start_url: '/',
    display: 'standalone',
    background_color: '#5304b4',
    theme_color: '#5304b4',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
