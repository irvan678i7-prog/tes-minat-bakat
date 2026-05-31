import { randomInt } from "crypto";

// Random short token codes untuk akses siswa. Format: 2 grup 4 karakter
// alfanumerik kapital (tidak termasuk karakter ambigu seperti 0/O dan 1/I).
// Pakai `crypto.randomInt` (CSPRNG) — `Math.random()` tidak boleh untuk
// nilai yang dipakai sebagai kredensial karena PRNG-nya bisa diprediksi.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTokenCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
