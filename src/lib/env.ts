// Pusat validasi environment variables. Di-import sekali oleh modul yang
// butuh, mis. `jwt.ts`. Tujuannya:
// - Fail fast di production kalau JWT_SECRET tidak di-set atau terlalu pendek
// - Memberi default aman di development tanpa crash
//
// Tidak pakai zod parse di top-level (supaya `next build` tetap bisa jalan
// tanpa semua env terisi); hanya secret yang benar-benar kritis yang
// di-enforce di production.

const isProd = process.env.NODE_ENV === "production";

function readSecret(name: string, minLength: number): string {
  const v = process.env[name];
  if (v && v.length >= minLength) return v;
  if (isProd) {
    throw new Error(
      `${name} environment variable is required and must be at least ${minLength} characters in production.`,
    );
  }
  // Dev fallback — tetap warning supaya tidak lupa set saat deploy.
  if (typeof console !== "undefined") {
    console.warn(
      `[env] ${name} not set or too short (<${minLength} chars). Using dev fallback. DO NOT deploy to production with this fallback.`,
    );
  }
  return v || "dev-only-insecure-secret-change-me-please-not-for-production-use-32";
}

export const JWT_SECRET = readSecret("JWT_SECRET", 32);

// Durasi JWT — bisa di-override via env tapi punya default aman.
// Student: cukup 3 jam (semua subtes BAKAT + buffer). Tadi 12 jam.
// Admin: 8 jam (1 shift kerja). Tadi 12 jam.
export const STUDENT_JWT_EXPIRES_IN = process.env.STUDENT_JWT_EXPIRES_IN || "3h";
export const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || "8h";

// Maksimum ukuran upload gambar (default 5 MB).
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);

// Whitelist MIME type untuk upload gambar soal.
export const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Mapping MIME → ekstensi aman (tidak boleh pakai ekstensi dari nama file
// karena bisa di-spoof).
export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
