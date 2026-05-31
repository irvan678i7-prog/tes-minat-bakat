import type { MetadataRoute } from "next";

// Search engine TIDAK boleh index halaman admin atau halaman tes siswa
// (token-protected). Hanya halaman publik (landing, dst) yang boleh.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/admin/*",
          "/api/",
          "/test",
          "/test/",
          "/test/*",
        ],
      },
    ],
  };
}
