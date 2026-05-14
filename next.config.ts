import type { NextConfig } from "next";

// Security headers diterapkan global ke semua route. Tujuan utama:
// - Tidak boleh di-iframe (clickjacking).
// - Browser tidak boleh tebak-MIME (X-Content-Type-Options).
// - Tidak kirim Referer ke origin lain (Referrer-Policy).
// - HTTPS strict (HSTS — hanya aktif kalau hosting sudah pakai HTTPS).
// - Tutup akses ke API sensor (Permissions-Policy).
//
// CSP TIDAK dipasang strict di sini karena Next.js memerlukan inline scripts
// untuk hydration; pasang CSP perlu nonce-based pattern yang non-trivial.
// Untuk sekarang cukup `X-Content-Type-Options` + `X-Frame-Options`.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Halaman admin tidak boleh di-index search engine.
const adminNoIndex = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
];

const nextConfig: NextConfig = {
  // Larang Next dari mem-bundle response yang besar dengan cache statis.
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/admin/:path*",
        headers: [...securityHeaders, ...adminNoIndex],
      },
      {
        source: "/api/admin/:path*",
        headers: [...securityHeaders, ...adminNoIndex],
      },
    ];
  },
};

export default nextConfig;
