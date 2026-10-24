import { normalize } from "node:path";
import { buildGbaSymbolIndex, buildGbcSymbolIndex, type SymbolIndex } from "@pokemap/core/src/defects/symbols.js";
import type { MapDefectsCheck } from "@pokemap/core/src/defects/types.js";

/** A failed build is reused for this long, so a persistently broken project is not re-walked on every request. */
const FAILURE_BACKOFF_MS = 5_000;

/** Owned by one project handler; hub reload creates a fresh owner. */
export function createSymbolIndexCache(root: string, family: "gba" | "gbc", now: () => number = () => Date.now()) {
  let symbols: SymbolIndex | undefined;
  let failure: { error: unknown; at: number } | undefined;
  const get = () => {
    if (symbols) return symbols;
    if (failure && now() - failure.at < FAILURE_BACKOFF_MS) throw failure.error;
    try {
      symbols = (family === "gba" ? buildGbaSymbolIndex : buildGbcSymbolIndex)(root);
      failure = undefined;
      return symbols;
    } catch (error) {
      failure = { error, at: now() };
      throw error;
    }
  };
  return {
    get,
    check<T extends MapDefectsCheck>(run: (index?: SymbolIndex) => T): T {
      let index: SymbolIndex | undefined;
      let reason: string | undefined;
      try { index = get(); }
      // F13: the banner names the project relative to its root, never by absolute path. Builders join paths, which
      // normalizes them, so the normalized root (no trailing separator) goes first, then the root as the hub got it.
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stripped = [normalize(root).replace(/[\\/]+$/, ""), root].reduce((text, form) => text.split(form).join("."), message);
        reason = `C7-C9 symbol checks unavailable: ${stripped}`;
      }
      const result = run(index);
      return reason ? { ...result, incomplete: [...result.incomplete, { file: ".", reason }] } : result;
    },
    invalidate: () => { symbols = undefined; failure = undefined; },
  };
}
