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
import type { StagedGrids } from "./types.js";

/** One grid file's use of the queried block, from the file's representative map. */
export interface MapUse {
  /** The alphabetically first map backed by this grid file (among consuming maps). */
  map: string;
  /** Cells of the effective grid whose raw id equals the queried id. */
  interior: number;
  /** GBC: 1 when the representative map's border is the queried id. GBA: border-bin cells matching it. */
  border: number;
  /**
   * GBC only: raw-0 interior cells, when the queried id is the map's border and
   * is not 0 itself (the engine draws a raw 0 as the border). Always 0 for GBA.
   */
  block0AsBorder: number;
}

export interface BlockUsage {
  /** Resolved files the block lives in / is described by (metatiles + collision, or metatiles + attributes). */
  files: string[];
  /** Tileset consts (GBC) or the one symbol (GBA) that consume the queried file. */
  tilesets: string[];
  maps: MapUse[];
  /** Grid files backing two or more maps, with every map name they back. */
  sharedGrids: { file: string; maps: string[] }[];
}

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

  const cached = diskCache.get(map.name);
  if (cached !== undefined) return cached;
  const grid = proj.layout(map).layout.blocks.map((b) => b.metatileId);
  diskCache.set(map.name, grid);
  return grid;
}

/** R6 plus R1/R2: usage for one GBC metatiles file, one entry per `.blk`. */
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
  const consuming = new Set(tilesets);

  const byFile = new Map<string, GbcMap[]>();
  for (const map of relations.maps) {
    if (!consuming.has(map.tileset)) continue;
    const group = byFile.get(map.blkPath) ?? [];
    group.push(map);
    byFile.set(map.blkPath, group);
  }

  const files = sorted([
    metatilesPath,
    ...tilesets.map((constName) => relations.tilesets.get(constName)!.collisionPath),
  ]);

  const maps: MapUse[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  const diskCache = new Map<string, readonly number[]>();

  for (const file of [...byFile.keys()].sort(compare)) {
    const group = byFile.get(file)!.sort((a, b) => compare(a.name, b.name));
    const representative = group[0]!;
    const grid = gbcEffectiveGrid(proj, relations, representative, grids, diskCache);

    let interior = 0;
    let zeros = 0;
    for (const cell of grid) {
      if (cell === blockId) interior++;
      if (cell === 0) zeros++;
    }
    const border = representative.border === blockId ? 1 : 0;
    const block0AsBorder = border === 1 && blockId !== 0 ? zeros : 0;
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
  const tilesets = relations.tilesetsByPath.get(canonicalTilesetPath(palMapPath)) ?? [];
  const withPalMap = tilesets.filter(
    (constName) =>
      canonicalTilesetPath(relations.tilesets.get(constName)!.palMapPath) ===
      canonicalTilesetPath(palMapPath),
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
    if (layout.primaryTileset === layout.secondaryTileset) {
      // A layout naming one tileset in both slots still has a primary role;
      // the engine treats the second slot as the paired one.
      add(layout.primaryTileset, { layout, role: "primary", pairedWith: layout.secondaryTileset });
      continue;
    }
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
 * R9 plus R1/R2: usage for one GBA tileset-local block id, one entry per
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
  const relations = gbaRelations(proj);
  const consuming = relations.consumingBySymbol.get(tilesetSymbol) ?? [];
  const mapsByLayout = gbaMapsByLayout(proj, relations);

  const byFile = new Map<string, { layout: Layout; target: number; names: string[] }>();
  for (const use of consuming) {
    const names = mapsByLayout.get(use.layout.id) ?? [];
    if (names.length === 0) continue;
    const target = use.role === "primary" ? localIndex : proj.splitFor(use.layout).metatiles + localIndex;
    const file = use.layout.blockdataFilepath;
    const existing = byFile.get(file);
    if (existing === undefined) {
      byFile.set(file, { layout: use.layout, target, names: [...names] });
    } else {
      // R2: one entry per grid file. Layouts sharing a file normally agree on
      // the target; the first (lowest layout id) supplies it and the border.
      existing.names = sorted([...existing.names, ...names]);
    }
  }

  const paths = proj.tilesetPaths(tilesetSymbol);
  const files = sorted([paths.metatilesBin, paths.attributesBin]);

  const maps: MapUse[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  const cellCache = new Map<string, readonly number[]>();

  for (const file of [...byFile.keys()].sort(compare)) {
    const group = byFile.get(file)!;
    const staged = group.names.find((name) => grids.has(name));
    const grid = staged !== undefined ? grids.get(staged)! : gbaCells(proj, file, cellCache);
    const border = gbaCells(proj, group.layout.borderFilepath, cellCache);

    let interior = 0;
    for (const cell of grid) if (cell === group.target) interior++;
    let borderCount = 0;
    for (const cell of border) if (cell === group.target) borderCount++;
    if (interior + borderCount === 0) continue;

    maps.push({ map: group.names[0]!, interior, border: borderCount, block0AsBorder: 0 });
    if (group.names.length >= 2) sharedGrids.push({ file, maps: [...group.names] });
  }

  maps.sort((a, b) => compare(a.map, b.map));
  sharedGrids.sort((a, b) => compare(a.file, b.file));

  return { files, tilesets: [tilesetSymbol], maps, sharedGrids };
}
