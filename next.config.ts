import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Same-origin only. The microphone and the camera (the optional on-device practice step in the coach review)
  // are requested only after an explicit opt-in and click. Client-side navigation keeps the policy of the page
  // where a visit started, so a per-route camera rule would never apply; third-party frames stay blocked.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
