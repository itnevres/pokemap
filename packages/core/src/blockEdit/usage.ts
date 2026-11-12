/**
 * Plan 14.2 Task 5: the block usage index for both families.
 *
 * Identity is the resolved repo-relative file path (forward slashes), never a
 * tileset name -- tilesets alias files (Crystal's Cave and DarkCave share
 * `cave_metatiles.bin`), so a name-keyed index would split or merge usage that
 * belongs to one file.
 *
 * Only **static relations** are cached: file -> tilesets, tileset -> maps /
 * layouts, and grid file -> maps. Counts are recomputed on every call from the
 * disk grids overridden by the caller's staged `grids`, so paint, fill, stamp,
 * undo/redo, discard and save need no invalidation hook. The relation cache
 * lives on the project object (a module-level `WeakMap`) and is rebuilt
 * whenever `tilesetGeneration` changes -- the overlay reset hook Task 1 ruled
 * on, with no callback registry.
 *
 * The one entry per grid file is deliberate: a `.blk` (GBC) or blockdata file
 * (GBA) can back several maps, and counting its cells once per map would
 * multiply the same cells.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GbcProject } from "../gbc/project.js";
import type { GbcMap, GbcTileset } from "../gbc/model/types.js";
import type { Project } from "../project.js";
import type { Layout, Split } from "../model/types.js";
import { parseBlocks } from "../load/blocks.js";
import { canonicalTilesetPath } from "./canonicalTilesetPath.js";
import type { StagedGrids, MapUse, BlockUsage } from "./types.js";

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort(compare);

// ---------------------------------------------------------------------------
// GBC static relations.
// ---------------------------------------------------------------------------

interface GbcRelations {
  generation: number;
  maps: readonly GbcMap[];
  /** Canonical tileset file path -> sorted distinct `TILESET_*` consts resolving it. */
  tilesetsByPath: Map<string, string[]>;
  /** `TILESET_*` const -> loaded tileset (through the project, so it honours the overlay). */
  tilesets: Map<string, GbcTileset>;
  /** Grid file (`.blk` path) -> every map name backed by it, sorted. */
  mapsByGridFile: Map<string, string[]>;
}

const gbcCache = new WeakMap<GbcProject, GbcRelations>();

function buildGbcRelations(proj: GbcProject): GbcRelations {
  const maps = [...proj.maps];
  const byPath = new Map<string, Set<string>>();
  const tilesets = new Map<string, GbcTileset>();

  for (const map of maps) {
    if (tilesets.has(map.tileset)) continue;
    const ts = proj.tileset(map.tileset);
    tilesets.set(map.tileset, ts);
    for (const path of [ts.gfxPath, ts.metatilesPath, ts.collisionPath, ts.palMapPath]) {
      const key = canonicalTilesetPath(path);
      const set = byPath.get(key) ?? new Set<string>();
      set.add(map.tileset);
      byPath.set(key, set);
    }
  }

  const tilesetsByPath = new Map<string, string[]>();
  for (const [path, set] of byPath) tilesetsByPath.set(path, sorted(set));

  const byGridFile = new Map<string, string[]>();
  for (const map of maps) {
    const list = byGridFile.get(map.blkPath) ?? [];
    list.push(map.name);
    byGridFile.set(map.blkPath, list);
  }
  const mapsByGridFile = new Map<string, string[]>();
  for (const [file, names] of byGridFile) mapsByGridFile.set(file, names.sort(compare));

  return { generation: proj.tilesetGeneration, maps, tilesetsByPath, tilesets, mapsByGridFile };
}

function gbcRelations(proj: GbcProject): GbcRelations {
  const cached = gbcCache.get(proj);
  if (cached !== undefined && cached.generation === proj.tilesetGeneration) return cached;
  const built = buildGbcRelations(proj);
  gbcCache.set(proj, built);
  return built;
}

/**
 * R5: the sorted distinct `TILESET_*` consts that any map uses and that resolve
 * `path` as one of their four identity files. Unknown paths answer `[]`.
 */
export function gbcTilesetsForFile(proj: GbcProject, path: string): string[] {
  return [...(gbcRelations(proj).tilesetsByPath.get(canonicalTilesetPath(path)) ?? [])];
}

/**
 * R3: for a grid file, the staged grid of the alphabetically first of its maps
 * present in `grids` wins; otherwise the disk `.blk` grid of `map` (which is
 * read through the project, as before, and limited to its declared w*h).
 * Cache keyed by grid file (blkPath), not map name.
 */
function gbcEffectiveGrid(
  proj: GbcProject,
  relations: GbcRelations,
  map: GbcMap,
  grids: StagedGrids,
  diskCache: Map<string, readonly number[]>,
): readonly number[] {
  const names = relations.mapsByGridFile.get(map.blkPath) ?? [];
  const staged = names.find((name) => grids.has(name));
  if (staged !== undefined) return grids.get(staged)!;

  const cached = diskCache.get(map.blkPath);
  if (cached !== undefined) return cached;
  const grid = proj.layout(map).layout.blocks.map((b) => b.metatileId);
  diskCache.set(map.blkPath, grid);
  return grid;
}

/** R6 plus R1/R2/R2a: usage for one GBC metatiles file, one entry per `.blk`. */
export function gbcBlockUsage(
  proj: GbcProject,
  metatilesPath: string,
  blockId: number,
  grids: StagedGrids,
): BlockUsage {
  const relations = gbcRelations(proj);
  const key = canonicalTilesetPath(metatilesPath);
  const tilesets = (relations.tilesetsByPath.get(key) ?? []).filter(
    (constName) => canonicalTilesetPath(relations.tilesets.get(constName)!.metatilesPath) === key,
  );

  // R6a: unknown/unconsumed path -> empty usage
  if (tilesets.length === 0) {
    return { files: [], tilesets: [], maps: [], sharedGrids: [] };
  }

  const consuming = new Set(tilesets);

  const byFile = new Map<string, GbcMap[]>();
  for (const map of relations.maps) {
    if (!consuming.has(map.tileset)) continue;
    const group = byFile.get(map.blkPath) ?? [];
    group.push(map);
    byFile.set(map.blkPath, group);
  }

  // R6a: files uses canonical paths
  const files = sorted([
    key,
    ...tilesets.map((constName) => relations.tilesets.get(constName)!.collisionPath),
  ]);

  const maps: MapUse[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  const diskCache = new Map<string, readonly number[]>();

  for (const file of [...byFile.keys()].sort(compare)) {
    const group = byFile.get(file)!.sort((a, b) => compare(a.name, b.name));
    const representative = group[0]!;

    // Interior: use the effective grid of the representative (per R3, one grid per file)
    const repGrid = gbcEffectiveGrid(proj, relations, representative, grids, diskCache);
    let interior = 0;
    for (const cell of repGrid) {
      if (cell === blockId) interior++;
    }

    // R2a: border and block0AsBorder summed over EVERY consuming map of the grid file
    let border = 0;
    let block0AsBorder = 0;

    for (const map of group) {
      if (map.border === blockId) {
        border++;
        if (blockId !== 0) {
          // Count raw-0 cells in this map's effective grid
          const grid = gbcEffectiveGrid(proj, relations, map, grids, diskCache);
          for (const cell of grid) {
            if (cell === 0) block0AsBorder++;
          }
        }
      }
    }

    if (interior + border + block0AsBorder === 0) continue;

    maps.push({ map: representative.name, interior, border, block0AsBorder });

    const all = relations.mapsByGridFile.get(file) ?? [];
    if (all.length >= 2) sharedGrids.push({ file, maps: [...all] });
  }

  maps.sort((a, b) => compare(a.map, b.map));
  sharedGrids.sort((a, b) => compare(a.file, b.file));

  return { files, tilesets: [...tilesets], maps, sharedGrids };
}

/**
 * R7: for a GBC palette map, the block ids that contain `tileId` in each
 * metatiles file, plus every map (of the tilesets sharing that palette map)
 * whose effective grid or border draws one of those blocks. Blocks are read
 * through `proj.tileset`, so a staged overlay is honoured.
 */
export function gbcTileUsage(
  proj: GbcProject,
  palMapPath: string,
  tileId: number,
  grids: StagedGrids,
): { blocks: { metatilesPath: string; ids: number[] }[]; maps: string[] } {
  const relations = gbcRelations(proj);
  const canonicalPalMap = canonicalTilesetPath(palMapPath);

  const tilesets = relations.tilesetsByPath.get(canonicalPalMap) ?? [];
  const withPalMap = tilesets.filter(
    (constName) =>
      canonicalTilesetPath(relations.tilesets.get(constName)!.palMapPath) === canonicalPalMap,
  );

  const constsByMetatiles = new Map<string, string[]>();
  for (const constName of withPalMap) {
    const path = relations.tilesets.get(constName)!.metatilesPath;
    const list = constsByMetatiles.get(path) ?? [];
    list.push(constName);
    constsByMetatiles.set(path, list);
  }

  const blocks: { metatilesPath: string; ids: number[] }[] = [];
  const idsByFile = new Map<string, Set<number>>();
  for (const path of [...constsByMetatiles.keys()].sort(compare)) {
    const constName = constsByMetatiles.get(path)!.sort(compare)[0]!;
    const ids = proj
      .tileset(constName)
      .metatiles.map((metatile, index) => (metatile.tiles.includes(tileId) ? index : -1))
      .filter((index) => index >= 0);
    if (ids.length === 0) continue;
    blocks.push({ metatilesPath: path, ids });
    idsByFile.set(path, new Set(ids));
  }

  const consuming = new Set(withPalMap);
  const found: string[] = [];
  const diskCache = new Map<string, readonly number[]>();
  for (const map of relations.maps) {
    if (!consuming.has(map.tileset)) continue;
    const ids = idsByFile.get(relations.tilesets.get(map.tileset)!.metatilesPath);
    if (ids === undefined) continue;
    const grid = gbcEffectiveGrid(proj, relations, map, grids, diskCache);
    if (grid.some((cell) => ids.has(cell)) || ids.has(map.border)) found.push(map.name);
  }

  return { blocks, maps: sorted(found) };
}

// ---------------------------------------------------------------------------
// GBA static relations.
// ---------------------------------------------------------------------------

interface GbaLayoutUse {
  layout: Layout;
  role: "primary" | "secondary";
  pairedWith: string;
}

interface GbaRelations {
  generation: number;
  /** Tileset symbol -> every layout consuming it, sorted by layout id. */
  consumingBySymbol: Map<string, GbaLayoutUse[]>;
  /** Layout id -> every map name using it, sorted; built on first need. */
  mapsByLayout?: Map<string, string[]>;
}

const gbaCache = new WeakMap<Project, GbaRelations>();

function buildGbaRelations(proj: Project): GbaRelations {
  const consumingBySymbol = new Map<string, GbaLayoutUse[]>();
  const add = (symbol: string, use: GbaLayoutUse): void => {
    const list = consumingBySymbol.get(symbol) ?? [];
    list.push(use);
    consumingBySymbol.set(symbol, list);
  };

  for (const layout of proj.layouts) {
    // R8a: layout with primary == secondary yields TWO uses (primary then secondary)
    add(layout.primaryTileset, { layout, role: "primary", pairedWith: layout.secondaryTileset });
    add(layout.secondaryTileset, { layout, role: "secondary", pairedWith: layout.primaryTileset });
  }
  for (const list of consumingBySymbol.values()) {
    list.sort((a, b) => compare(a.layout.id, b.layout.id));
  }

  return { generation: proj.tilesetGeneration, consumingBySymbol };
}

function gbaRelations(proj: Project): GbaRelations {
  const cached = gbaCache.get(proj);
  if (cached !== undefined && cached.generation === proj.tilesetGeneration) return cached;
  const built = buildGbaRelations(proj);
  gbaCache.set(proj, built);
  return built;
}

/** R9's layout -> maps half, deferred so `gbaConsumingLayouts` does not read every map.json. */
function gbaMapsByLayout(proj: Project, relations: GbaRelations): Map<string, string[]> {
  if (relations.mapsByLayout !== undefined) return relations.mapsByLayout;
  const byLayout = new Map<string, string[]>();
  for (const name of proj.mapNames()) {
    const layout = proj.map(name).layout;
    const list = byLayout.get(layout) ?? [];
    list.push(name);
    byLayout.set(layout, list);
  }
  for (const list of byLayout.values()) list.sort(compare);
  relations.mapsByLayout = byLayout;
  return byLayout;
}

/**
 * R8: every layout consuming `tilesetSymbol`, with its role, its split and the
 * tileset it is paired with, sorted by layout id. `layout` is the layout id.
 * R8a: layout with primary == secondary yields two uses (primary then secondary).
 */
export function gbaConsumingLayouts(
  proj: Project,
  tilesetSymbol: string,
): { layout: string; role: "primary" | "secondary"; split: Split; pairedWith: string }[] {
  const uses = gbaRelations(proj).consumingBySymbol.get(tilesetSymbol) ?? [];
  return uses.map((use) => ({
    layout: use.layout.id,
    role: use.role,
    split: proj.splitFor(use.layout),
    pairedWith: use.pairedWith,
  }));
}

/** The parsed cells of a GBA blockdata/border file, cached per call. */
function gbaCells(proj: Project, path: string, cache: Map<string, readonly number[]>): readonly number[] {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const cells = parseBlocks(readFileSync(join(proj.paths.root, path)), proj.profile).map((b) => b.metatileId);
  cache.set(path, cells);
  return cells;
}

/**
 * R9 plus R1/R2/R9a: usage for one GBA tileset-local block id, one entry per
 * blockdata file. A primary layout counts `localIndex`; a secondary layout
 * counts `split.metatiles + localIndex`, because its ids sit above that
 * layout's own primary boundary.
 */
export function gbaBlockUsage(
  proj: Project,
  tilesetSymbol: string,
  localIndex: number,
  grids: StagedGrids,
): BlockUsage {
  // R9b: unknown symbol -> empty usage (no throw)
  if (!proj.tilesetSymbols().includes(tilesetSymbol)) {
    return { files: [], tilesets: [], maps: [], sharedGrids: [] };
  }

  const relations = gbaRelations(proj);
  const consuming = relations.consumingBySymbol.get(tilesetSymbol) ?? [];
  const mapsByLayout = gbaMapsByLayout(proj, relations);

  // R9a: per-file counting - collect every consuming use (layout, role) on each file
  // with its target id. Then sum over distinct targets for interior,
  // and distinct (borderFilepath, target) for border.
  const byFile = new Map<string, {
    targets: Set<number>;
    borderTargets: Map<string, Set<number>>; // borderFilepath -> set of targets
    layouts: Layout[];
    allMapNames: string[]; // ALL maps of ALL layouts on this file (for sharedGrids)
    consumingMapNames: string[]; // maps of consuming layouts (for representative)
  }>();

  for (const use of consuming) {
    const names = mapsByLayout.get(use.layout.id) ?? [];
    if (names.length === 0) continue;
    const target = use.role === "primary" ? localIndex : proj.splitFor(use.layout).metatiles + localIndex;
    const file = use.layout.blockdataFilepath;
    const existing = byFile.get(file);
    if (existing === undefined) {
      // Gather all maps of ALL layouts on this file for sharedGrids
      const allLayoutsOnFile = proj.layouts.filter(l => l.blockdataFilepath === file);
      const allMapNames: string[] = [];
      for (const l of allLayoutsOnFile) {
        const maps = mapsByLayout.get(l.id) ?? [];
        allMapNames.push(...maps);
      }
      allMapNames.sort(compare);

      // Consuming map names for representative
      const consumingMapNames = [...names].sort(compare);

      byFile.set(file, {
        targets: new Set([target]),
        borderTargets: new Map([[use.layout.borderFilepath, new Set([target])]]),
        layouts: [use.layout],
        allMapNames,
        consumingMapNames,
      });
    } else {
      existing.targets.add(target);
      const borderSet = existing.borderTargets.get(use.layout.borderFilepath) ?? new Set<number>();
      borderSet.add(target);
      existing.borderTargets.set(use.layout.borderFilepath, borderSet);
      existing.layouts.push(use.layout);
      existing.consumingMapNames = sorted([...existing.consumingMapNames, ...names]);
    }
  }

  // R6a: files from canonical paths (proj.tilesetPaths returns canonical paths)
  const paths = proj.tilesetPaths(tilesetSymbol);
  const files = sorted([paths.metatilesBin, paths.attributesBin]);

  const maps: MapUse[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  const cellCache = new Map<string, readonly number[]>();

  for (const file of [...byFile.keys()].sort(compare)) {
    const group = byFile.get(file)!;

    // Staged grid: use alphabetically first consuming map present in grids
    // R3: any map backed by the file (consuming or not) may carry the staged grid.
    const stagedName = group.allMapNames.find((name) => grids.has(name));
    const grid = stagedName !== undefined ? grids.get(stagedName)! : gbaCells(proj, file, cellCache);

    // Interior: sum over DISTINCT targets
    let interior = 0;
    for (const target of group.targets) {
      for (const cell of grid) {
        if (cell === target) interior++;
      }
    }

    // Border: sum over DISTINCT (borderFilepath, target) pairs
    let border = 0;
    for (const [borderFile, targets] of group.borderTargets) {
      const borderCells = gbaCells(proj, borderFile, cellCache);
      for (const target of targets) {
        for (const cell of borderCells) {
          if (cell === target) border++;
        }
      }
    }

    if (interior + border === 0) continue;

    // Representative map = alphabetically first consuming map
    const representative = group.consumingMapNames[0]!;
    maps.push({ map: representative, interior, border, block0AsBorder: 0 });

    // R9a: sharedGrids = maps of ALL layouts on the file (consuming or not), when 2+
    if (group.allMapNames.length >= 2) {
      sharedGrids.push({ file, maps: [...group.allMapNames] });
    }
  }

  maps.sort((a, b) => compare(a.map, b.map));
  sharedGrids.sort((a, b) => compare(a.file, b.file));

  return { files, tilesets: [tilesetSymbol], maps, sharedGrids };
}
