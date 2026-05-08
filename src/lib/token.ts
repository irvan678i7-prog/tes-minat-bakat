// Random short token codes for student access. Format: 6 groups of 4 chars,
// uppercase alphanumeric (excluding ambiguous chars).
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTokenCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
