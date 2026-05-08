/** Helpers for safely working with Prisma JSON columns from API code. */
export function asJson<T>(val: unknown): T {
  return val as T;
}

export type OptionItem = { key: string; label: string; imageUrl?: string };
