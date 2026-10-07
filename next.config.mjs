const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Safe subset of a CSP (a full script-src policy needs nonces for Next.js inline scripts)
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Microphone/camera are needed for calls and voice typing; everything else is off
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(self), geolocation=(), payment=()' },
];

// API responses are never cached by browsers or the CDN
const apiHeaders = [{ key: 'Cache-Control', value: 'no-store' }];

export default {
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: apiHeaders },
    ];
  },
};
