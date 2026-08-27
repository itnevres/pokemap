export interface FieldmapConstants {
  tilesInPrimary: number;
  tilesInPrimaryEmerald: number;
  metatilesInPrimary: number;
  metatilesInPrimaryEmerald: number;
  palsInPrimary: number;
  palsInPrimaryEmerald: number;
  metatilesTotal: number;
}

function defineValue(src: string, name: string): number | undefined {
  const re = new RegExp(`^\\s*#define\\s+${name}\\s+(\\d+)\\s*(?://.*)?$`, "m");
  const m = re.exec(src);
  return m?.[1] === undefined ? undefined : Number(m[1]);
}

export function parseFieldmapConstants(src: string): FieldmapConstants {
  const tiles = defineValue(src, "NUM_TILES_IN_PRIMARY") ?? 512;
  const metatiles = defineValue(src, "NUM_METATILES_IN_PRIMARY") ?? 512;
  const pals = defineValue(src, "NUM_PALS_IN_PRIMARY") ?? 6;
  return {
    tilesInPrimary: tiles,
    // An engine with no per-layout split has one boundary; the "emerald" set
    // collapses onto it. That is the correct behaviour for pokeemerald,
    // pokefirered, modern-emerald and pokeclassic.
    tilesInPrimaryEmerald: defineValue(src, "NUM_TILES_IN_PRIMARY_EMERALD") ?? tiles,
    metatilesInPrimary: metatiles,
    metatilesInPrimaryEmerald: defineValue(src, "NUM_METATILES_IN_PRIMARY_EMERALD") ?? metatiles,
    palsInPrimary: pals,
    palsInPrimaryEmerald: defineValue(src, "NUM_PALS_IN_PRIMARY_EMERALD") ?? pals,
    metatilesTotal: defineValue(src, "NUM_METATILES_TOTAL") ?? 1024,
  };
}
