/** Keeps the previous reference for every listed key whose value did not change (compared structurally), so
 *  an in-place payload reload does not give consumers that key a new identity (the edit-session seed is keyed
 *  on the payload's `blocks`/`map`/`events` identities and a new seed hides the live session view). */
export function keepUnchanged<T extends object>(prev: T | null | undefined, next: T, keys: readonly (keyof T)[]): T {
  if (!prev) return next;
  let out = next;
  for (const key of keys) {
    if (prev[key] === next[key] || JSON.stringify(prev[key]) !== JSON.stringify(next[key])) continue;
    if (out === next) out = { ...next };
    out[key] = prev[key];
  }
  return out;
}
