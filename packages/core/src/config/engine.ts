export interface EngineProfile {
  baseGameVersion: string;
  blockMetatileIdMask: number;
  blockCollisionMask: number;
  blockCollisionShift: number;
  blockElevationMask: number;
  blockElevationShift: number;
  metatileAttributesSize: 2 | 4;
  metatileBehaviorMask: number;
  metatileLayerTypeMask: number;
  metatileTerrainTypeMask: number;
  metatileEncounterTypeMask: number;
  warpBehaviors: number[];
  /** Whether layouts.json may carry a per-layout `layout_version` key. */
  supportsLayoutVersion: boolean;
  supportsFloorNumber: boolean;
}

export function parseCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

/** `Number()` parses "0x1FF" natively, so hex and decimal both just work. */
const num = (v: string | undefined, dflt: number): number =>
  v === undefined || v === "" ? dflt : Number(v);

/**
 * Bit position of the lowest set bit, i.e. the shift a mask implies.
 *
 * Uses the signed `>>` operator. This is safe for every mask this code
 * actually sees: JS's `>>` performs an arithmetic (sign-propagating) shift
 * after a ToInt32 conversion, so even a mask with bit 31 set (e.g. a
 * hypothetical 0x80000000) sign-extends to -1 by the time the shift reaches
 * that bit, and `-1 & 1 === 1` terminates the loop at s=31 rather than
 * looping forever. The `mask === 0` guard above handles the only value for
 * which no bit is ever found. See the engine.ts self-review notes for the
 * verification of this claim (checked against 0x80000000, 0xF0000000, and
 * 0xFFFFFFFF directly).
 */
export function maskShift(mask: number): number {
  if (mask === 0) return 0;
  let s = 0;
  while (((mask >> s) & 1) === 0) s++;
  return s;
}

export function defaultProfile(version: string): EngineProfile {
  const frlg = version === "pokefirered";
  return {
    baseGameVersion: version,
    blockMetatileIdMask: 0x3ff,
    blockCollisionMask: 0xc00,
    blockCollisionShift: 10,
    blockElevationMask: 0xf000,
    blockElevationShift: 12,
    metatileAttributesSize: frlg ? 4 : 2,
    metatileBehaviorMask: frlg ? 0x1ff : 0xff,
    metatileLayerTypeMask: frlg ? 0x60000000 : 0xf000,
    metatileTerrainTypeMask: frlg ? 0x3e00 : 0,
    metatileEncounterTypeMask: frlg ? 0x7000000 : 0,
    warpBehaviors: [],
    supportsLayoutVersion: version === "pokeemerald-expansion",
    supportsFloorNumber: frlg,
  };
}

// Adding a cfg-backed field to EngineProfile? Add its override below too.
// The `...base` spread makes every field structurally satisfied, so a forgotten
// override type-checks fine and silently returns the default instead of the
// value the cfg asked for.
export function engineProfile(cfg: Record<string, string>): EngineProfile {
  const base = defaultProfile(cfg.base_game_version ?? "pokeemerald");
  const collision = num(cfg.block_collision_mask, base.blockCollisionMask);
  const elevation = num(cfg.block_elevation_mask, base.blockElevationMask);
  return {
    ...base,
    blockMetatileIdMask: num(cfg.block_metatile_id_mask, base.blockMetatileIdMask),
    blockCollisionMask: collision,
    blockCollisionShift: maskShift(collision),
    blockElevationMask: elevation,
    blockElevationShift: maskShift(elevation),
    metatileAttributesSize: (num(cfg.metatile_attributes_size, base.metatileAttributesSize) === 4 ? 4 : 2),
    metatileBehaviorMask: num(cfg.metatile_behavior_mask, base.metatileBehaviorMask),
    metatileLayerTypeMask: num(cfg.metatile_layer_type_mask, base.metatileLayerTypeMask),
    metatileTerrainTypeMask: num(cfg.metatile_terrain_type_mask, base.metatileTerrainTypeMask),
    metatileEncounterTypeMask: num(cfg.metatile_encounter_type_mask, base.metatileEncounterTypeMask),
    warpBehaviors: (cfg.warp_behaviors ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number),
  };
}
