/** Metatile and tile ids display as upper-case hex everywhere (`0x1AF`). */
export const hex = (n: number): string => `0x${n.toString(16).toUpperCase()}`;

/** A non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
