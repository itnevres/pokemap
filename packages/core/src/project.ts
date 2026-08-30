import { existsSync, readFileSync } from "node:fs";
import { projectPaths, type ProjectPaths } from "./config/paths.js";
import { parseFieldmapConstants, type FieldmapConstants } from "./config/fieldmap.js";
import { engineProfile, defaultProfile, parseCfg, type EngineProfile } from "./config/engine.js";
import { parseLayouts, resolveSplit } from "./load/layouts.js";
import { parseMapGroups, parseMap, type MapData, type MapGroups } from "./load/maps.js";
import { parseTilesetPaths, type TilesetPaths } from "./load/tilesets.js";
import { loadTileset, type Tileset } from "./load/tilesetData.js";
import type { Layout, Split } from "./model/types.js";

export interface Project {
  readonly paths: ProjectPaths;
  readonly profile: EngineProfile;
  readonly constants: FieldmapConstants;
  readonly layouts: readonly Layout[];
  readonly groups: MapGroups;
  /** Layout names end in `_Layout` -- "PetalburgCity_Layout", not
   *  "PetalburgCity". The directory under data/layouts/ uses the short form,
   *  and the map that uses it is a third name again. Do not conflate them. */
  layoutByName(name: string): Layout | undefined;
  layoutById(id: string): Layout | undefined;
  /** The layout a MAP uses. Most callers start from a map name, so reach for
   *  this rather than guessing at the layout's name.
   *
   *  Unlike `layoutByName`/`layoutById`, this throws instead of returning
   *  `undefined` on a miss. Those two answer "is there one?" for a caller who
   *  does not yet know; this one is only ever reached after `map(mapName)` has
   *  already proven the map exists, so a miss here means the tree itself is
   *  inconsistent (the map's `layout` id is not in layouts.json) rather than a
   *  caller typo -- and that is a refusal, not an `undefined`. */
  layoutForMap(mapName: string): Layout;
  splitFor(layout: Layout): Split;
  tileset(symbol: string): Tileset;
  map(name: string): MapData;
  mapNames(): string[];
}

export function openProject(root: string): Project {
  const paths = projectPaths(root);

  // Task 15 passes --project straight through from user input, so this is the
  // first error most users will ever see from this tool. Every other read
  // below would otherwise fail as a bare ENOENT naming neither the root nor
  // what was expected to be there.
  if (!existsSync(paths.fieldmapH)) {
    throw new Error(`${root} does not look like a decomp project root: missing ${paths.fieldmapH}`);
  }

  const profileBase = existsSync(paths.porymapCfg)
    ? engineProfile(parseCfg(readFileSync(paths.porymapCfg, "utf8")))
    : defaultProfile(guessVersion(paths));

  const constants = parseFieldmapConstants(readFileSync(paths.fieldmapH, "utf8"));
  const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));

  // A tree only defines a second boundary set if its layouts choose between
  // them, and Porymap does not write include/fieldmap.h. Unlike the
  // layouts.json scan below, this evidence survives a Porymap save -- which is
  // the case that matters, because that save is what removes the other
  // evidence. Absent on pokeemerald-expansion, whose second set is named
  // *_FRLG rather than *_EMERALD, so the cfg term stays too.
  const hasSplitConstants =
    constants.metatilesInPrimary !== constants.metatilesInPrimaryEmerald ||
    constants.tilesInPrimary !== constants.tilesInPrimaryEmerald ||
    constants.palsInPrimary !== constants.palsInPrimaryEmerald;

  // The cfg's base_game_version does not say whether this tree carries
  // per-layout versions. The data does -- but the layouts.json scan alone is
  // disarmed by the exact event it exists to detect: Porymap deletes
  // `layout_version` keys it does not recognise when it saves, and that is
  // precisely when the diagnostic downstream (Plan 2's missing-layout-version
  // refusal) is needed most. hasSplitConstants is the term that survives that
  // save.
  const profile: EngineProfile = {
    ...profileBase,
    supportsLayoutVersion:
      profileBase.supportsLayoutVersion ||
      hasSplitConstants ||
      layouts.some((l) => l.layoutVersion !== undefined),
  };

  const groups = parseMapGroups(readFileSync(paths.mapGroupsJson, "utf8"));
  // BOTH graphics sources, as in Tasks 10 and 13. gTileset_General and its two
  // Frontier siblings INCBIN their palettes from src/graphics.c, not
  // graphics.h. With graphics.h alone their `palettes` array is empty, every
  // colour lookup misses, and the 242 layouts that use them render fully
  // transparent -- silently. Nothing in this task's tests would catch it:
  // renderLayout still returns the right dimensions, still throws nothing, and
  // still reports outOfRangeCount 0. Task 15's PNG output is where you would
  // finally see it, one task too late.
  const tsPaths: Map<string, TilesetPaths> = parseTilesetPaths(
    readFileSync(paths.tilesetHeadersH, "utf8"),
    readFileSync(paths.tilesetMetatilesH, "utf8"),
    [readFileSync(paths.tilesetGraphicsH, "utf8"), readFileSync(paths.tilesetGraphicsC, "utf8")],
  );

  const tilesetCache = new Map<string, Tileset>();
  const mapCache = new Map<string, MapData>();

  const getMap = (name: string): MapData => {
    let m = mapCache.get(name);
    if (!m) {
      // Without this, a typo'd map name fails as a bare ENOENT on map.json,
      // and layoutForMap's own careful message (below) is never reached
      // because it calls this first.
      if (!groups.allMapNames().includes(name)) {
        throw new Error(`unknown map ${name}; not listed in ${paths.mapGroupsJson}`);
      }
      m = parseMap(readFileSync(paths.mapJson(name), "utf8"));
      mapCache.set(name, m);
    }
    return m;
  };

  const getTileset = (symbol: string): Tileset => {
    let t = tilesetCache.get(symbol);
    if (!t) {
      const tp = tsPaths.get(symbol);
      if (!tp) {
        throw new Error(`unknown tileset symbol ${symbol}: no "const struct Tileset ${symbol}" resolved from ${paths.tilesetHeadersH}`);
      }
      t = loadTileset(paths, tp, profile);
      tilesetCache.set(symbol, t);
    }
    return t;
  };

  const layoutForMap = (mapName: string): Layout => {
    const map = getMap(mapName);
    const layout = layouts.find((l) => l.id === map.layout);
    if (!layout) {
      throw new Error(
        `map ${mapName} (${paths.mapJson(mapName)}) references layout ${map.layout}, ` +
        `which is not defined in ${paths.layoutsJson}`,
      );
    }
    return layout;
  };

  return {
    paths, profile, constants, layouts, groups,
    layoutByName: (n) => layouts.find((l) => l.name === n),
    layoutById: (id) => layouts.find((l) => l.id === id),
    layoutForMap,
    splitFor: (l) => resolveSplit(l, constants),
    tileset: getTileset,
    map: getMap,
    mapNames: () => groups.allMapNames(),
  };
}

function guessVersion(paths: ProjectPaths): string {
  const src = existsSync(paths.fieldmapH) ? readFileSync(paths.fieldmapH, "utf8") : "";
  return /NUM_METATILES_IN_PRIMARY_EMERALD/.test(src) ? "pokeemerald-expansion" : "pokeemerald";
}
