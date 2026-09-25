import { readFileSync } from "node:fs";
import { norm } from "../config/paths.js";
import { loadGbcMaps, loadLayout, type LoadedGbcMaps } from "./load/map.js";
import { loadGbcTileset, loadGbcWaterCollisionValues } from "./load/tileset.js";
import { loadPaletteTables, type PaletteTables } from "./load/palette.js";
import { loadGbcRoofs, type GbcRoofs } from "./load/roofs.js";
import { loadGbcWildData } from "./load/encounters.js";
import { findDefEqu } from "./load/asm.js";
import type { GbcMap, GbcTileset, Layout, DataDefect, GbcWildData } from "./model/types.js";

/**
 * `constants/gfx_constants.asm`'s `DEF MAP_CONNECTION_PADDING_WIDTH EQU 3`
 * (GBC format findings §Extra Border) -- the real depth, in blocks, of the
 * connection-padding ring the engine draws around every map. Task 9's border
 * render reads this rather than hardcoding `3`, so a fork that changes the
 * constant changes the render's own cap instead of silently mismatching it.
 * Exported for direct unit testing (fix round 2, quality review minor #3) --
 * `findDefEqu` (`asm.ts`, fix round 2 minor #1) does the actual line-finding
 * and value-parsing, refusing (naming `source`) both "not found" and a
 * malformed/valueless `EQU` line (minor #2 -- the earlier inline version
 * force-unwrapped that match and crashed unnamed on the latter).
 */
export function parsePaddingWidth(text: string, source: string): number {
  return findDefEqu(text, "MAP_CONNECTION_PADDING_WIDTH", source);
}

/**
 * The shared per-root cache Tasks 10-12 (CLI, world stitching, atlas) reuse
 * alongside Task 9's per-map render, mirroring the GBA `Project`
 * (`packages/core/src/project.ts`)'s own shape: everything here is read-only,
 * a missing file fails loudly (through the loaders it wraps, which already
 * name the file), and every cache is keyed by exactly the thing that varies
 * (tileset by `TILESET_*` const, palette tables and roofs once per root).
 * `layout` is deliberately NOT cached -- `loadLayout`'s own doc comment notes
 * it is cheap and, unlike a tileset (shared by ~11 maps on average), a
 * layout's `.blk` is read once per render call in the common case anyway.
 */
export interface GbcProject {
  readonly root: string;
  readonly maps: GbcMap[];
  map(name: string): GbcMap;
  /** Cached per `TILESET_*` const (`loadGbcTileset` is deliberately
   *  uncached -- see its own doc comment). 391 maps share 37 tilesets. */
  tileset(tilesetConst: string): GbcTileset;
  /** Lazy, cached once per root: every shared palette table
   *  (`loadPaletteTables`'s own cost is per-root, not per-map). */
  paletteTables(): PaletteTables;
  /** Lazy, cached once per root: `MapGroupRoofs` plus the 5 roof tile sets. */
  roofs(): GbcRoofs;
  layout(map: Pick<GbcMap, "blkPath" | "width" | "height">): { layout: Layout; defects: DataDefect[] };
  /** Lazy, cached once per root: `MAP_CONNECTION_PADDING_WIDTH`
   *  (`constants/gfx_constants.asm`, GBC format findings §Extra Border) --
   *  the real cap on `renderGbcMap`'s `border` option. */
  paddingWidth(): number;
  /** Lazy, cached once per root: `loadGbcWildData(root)` (Task 12's atlas).
   *  Grass/water/fish/headbutt/rock all live in a handful of small `data/wild/*.asm`
   *  files read once and reused for every one of the atlas's 391-map scans,
   *  the same "load once, reuse everywhere" shape as `tileset()`/`roofs()`. */
  wild(): GbcWildData;
  /** Lazy, cached once per root: the set of raw `COLL_*` byte values that
   *  resolve to the `WATER_TILE` category (`load/tileset.ts`'s
   *  `loadGbcWaterCollisionValues`) -- Task 12's fishing-reachability check
   *  reads two small global files once per root, not once per map. */
  waterCollisionValues(): Set<number>;
}

export function openGbcProject(root: string): GbcProject {
  const r = norm(root);
  const loaded: LoadedGbcMaps = loadGbcMaps(r);

  const tilesetCache = new Map<string, GbcTileset>();
  let paletteTablesCache: PaletteTables | undefined;
  let roofsCache: GbcRoofs | undefined;
  let paddingWidthCache: number | undefined;
  let wildCache: GbcWildData | undefined;
  let waterCollisionValuesCache: Set<number> | undefined;

  return {
    root: r,
    maps: loaded.maps,
    map: loaded.map,
    tileset: (tilesetConst: string): GbcTileset => {
      let t = tilesetCache.get(tilesetConst);
      if (!t) {
        t = loadGbcTileset(r, tilesetConst);
        tilesetCache.set(tilesetConst, t);
      }
      return t;
    },
    paletteTables: (): PaletteTables => {
      if (!paletteTablesCache) paletteTablesCache = loadPaletteTables(r);
      return paletteTablesCache;
    },
    roofs: (): GbcRoofs => {
      if (!roofsCache) roofsCache = loadGbcRoofs(r);
      return roofsCache;
    },
    layout: (map) => loadLayout(r, map),
    paddingWidth: (): number => {
      if (paddingWidthCache === undefined) {
        paddingWidthCache = parsePaddingWidth(readFileSync(`${r}/constants/gfx_constants.asm`, "utf8"), "constants/gfx_constants.asm");
      }
      return paddingWidthCache;
    },
    wild: (): GbcWildData => {
      if (!wildCache) wildCache = loadGbcWildData(r);
      return wildCache;
    },
    waterCollisionValues: (): Set<number> => {
      if (!waterCollisionValuesCache) waterCollisionValuesCache = loadGbcWaterCollisionValues(r);
      return waterCollisionValuesCache;
    },
  };
}
