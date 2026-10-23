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
      catch (error) { reason = `C7-C9 symbol checks unavailable: ${error instanceof Error ? error.message : String(error)}`; }
      const result = run(index);
      return reason ? { ...result, incomplete: [...result.incomplete, { file: root, reason }] } : result;
    },
    invalidate: () => { symbols = undefined; failure = undefined; },
  };
}
