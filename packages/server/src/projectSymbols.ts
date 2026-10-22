import { buildGbaSymbolIndex, buildGbcSymbolIndex, type SymbolIndex } from "@pokemap/core/src/defects/symbols.js";
import type { MapDefectsCheck } from "@pokemap/core/src/defects/types.js";

/** Owned by one project handler; hub reload creates a fresh owner. */
export function createSymbolIndexCache(root: string, family: "gba" | "gbc") {
  let symbols: SymbolIndex | undefined;
  const get = () => (symbols ??= (family === "gba" ? buildGbaSymbolIndex : buildGbcSymbolIndex)(root));
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
    invalidate: () => { symbols = undefined; },
  };
}
