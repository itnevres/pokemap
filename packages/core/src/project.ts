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
  paths: ProjectPaths;
  profile: EngineProfile;
  constants: FieldmapConstants;
  layouts: Layout[];
  groups: MapGroups;
  /** Layout names end in `_Layout` -- "PetalburgCity_Layout", not
   *  "PetalburgCity". The directory under data/layouts/ uses the short form,
   *  and the map that uses it is a third name again. Do not conflate them. */
  layoutByName(name: string): Layout | undefined;
  layoutById(id: string): Layout | undefined;
  /** The layout a MAP uses. Most callers start from a map name, so reach for
   *  this rather than guessing at the layout's name. */
  layoutForMap(mapName: string): Layout;
  splitFor(layout: Layout): Split;
  tileset(symbol: string): Tileset;
  map(name: string): MapData;
  mapNames(): string[];
}

export function openProject(root: string): Project {
  const paths = projectPaths(root);

  const profileBase = existsSync(paths.porymapCfg)
    ? engineProfile(parseCfg(readFileSync(paths.porymapCfg, "utf8")))
    : defaultProfile(guessVersion(paths));

  const constants = parseFieldmapConstants(readFileSync(paths.fieldmapH, "utf8"));
  const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));

  // The cfg's base_game_version does not say whether this tree carries
  // per-layout versions. The data does.
  const profile: EngineProfile = {
    ...profileBase,
    supportsLayoutVersion:
      profileBase.supportsLayoutVersion || layouts.some((l) => l.layoutVersion !== undefined),
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

  return {
    paths, profile, constants, layouts, groups,
    layoutByName: (n) => layouts.find((l) => l.name === n),
    layoutById: (id) => layouts.find((l) => l.id === id),
    layoutForMap(mapName) {
      const map = this.map(mapName);
      const layout = layouts.find((l) => l.id === map.layout);
      if (!layout) throw new Error(`map ${mapName} references unknown layout ${map.layout}`);
      return layout;
    },
    splitFor: (l) => resolveSplit(l, constants),
    tileset(symbol) {
      let t = tilesetCache.get(symbol);
      if (!t) {
        const tp = tsPaths.get(symbol);
        if (!tp) throw new Error(`unknown tileset symbol ${symbol}`);
        t = loadTileset(paths, tp, profile);
        tilesetCache.set(symbol, t);
      }
      return t;
    },
    map(name) {
      let m = mapCache.get(name);
      if (!m) { m = parseMap(readFileSync(paths.mapJson(name), "utf8")); mapCache.set(name, m); }
      return m;
    },
    mapNames: () => groups.allMapNames(),
  };
}

function guessVersion(paths: ProjectPaths): string {
  const src = existsSync(paths.fieldmapH) ? readFileSync(paths.fieldmapH, "utf8") : "";
  return /NUM_METATILES_IN_PRIMARY_EMERALD/.test(src) ? "pokeemerald-expansion" : "pokeemerald";
}
