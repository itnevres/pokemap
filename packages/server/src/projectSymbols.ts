import { buildGbaSymbolIndex, buildGbcSymbolIndex, type SymbolIndex } from "@pokemap/core/src/defects/symbols.js";

/** Owned by one project handler; hub reload creates a fresh owner. */
export function createSymbolIndexCache(root: string, family: "gba" | "gbc") {
  let symbols: SymbolIndex | undefined;
  return {
    get: () => (symbols ??= (family === "gba" ? buildGbaSymbolIndex : buildGbcSymbolIndex)(root)),
    invalidate: () => { symbols = undefined; },
  };
}
