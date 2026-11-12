/**
 * Plan 14.2 Task 5's usage index, checked against an **independent oracle**.
 *
 * The expected numbers below are produced by plain `node:fs` parsing of the
 * decomp sources and binaries in this file -- never by the project loaders and
 * never by `usage.ts`. The only project calls are `openGbcProject` /
 * `openProject` (to hand a project to the functions under test) and
 * `proj.splitFor`, which the brief excludes from the oracle.
 *
 * Every fixture map and block id is found by scanning, so the tests follow the
 * subject tree instead of pinning ids that a tileset edit could move. The only
 * named fixtures are the ones the task spec names: `TILESET_CAVE` /
 * `TILESET_DARK_CAVE`, OlivinePortPassage / VermilionPortPassage and
 * `gTileset_General`.
 *
 * `.blk` byte counts are limited to the map's declared `width * height`
 * (parsed from `constants/map_constants.asm`), not the whole file: the subject
 * has oversize `.blk` files and the project layout only exposes the declared
 * cells, so the whole file would disagree on exactly those maps.
 */

import { describe, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openGbcProject } from "../../src/gbc/project.js";
import { openProject, type Project } from "../../src/project.js";
import type { StagedGrids } from "../../src/blockEdit/types.js";
import type { Split } from "../../src/model/types.js";
import {
  gbaBlockUsage,
  gbaConsumingLayouts,
  gbcBlockUsage,
  gbcTileUsage,
  gbcTilesetsForFile,
} from "../../src/blockEdit/usage.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

// ---------------------------------------------------------------------------
// Shared text helpers (plain RGBDS-line parsing; deliberately not `src/gbc/load`).
// ---------------------------------------------------------------------------

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const stripComment = (line: string): string => line.replace(/;.*$/, "");

function num(text: string): number {
  const t = text.trim();
  if (/^\$[0-9A-Fa-f]+$/.test(t)) return parseInt(t.slice(1), 16);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  throw new Error(`oracle: "${text}" is not a $hex or decimal literal`);
}

function args(rest: string | undefined): string[] {
  if (rest === undefined || rest.trim() === "") return [];
  return rest.split(",").map((part) => part.trim());
}

/** A `<keyword> <comma args>` invocation line, or null. */
function call(line: string, keyword: string): string[] | null {
  const m = stripComment(line).match(new RegExp(`^\\s*${keyword}(?:\\s+(.*))?$`));
  return m ? args(m[1]) : null;
}

/** Lines outside every `MACRO` ... `ENDM` body, mirroring the loader's own skipper. */
function codeLines(text: string): string[] {
  const out: string[] = [];
  let inMacro = false;
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (!inMacro && /^\s*MACRO\b/.test(line)) {
      inMacro = true;
      continue;
    }
    if (inMacro) {
      if (/^\s*ENDM\b/.test(line)) inMacro = false;
      continue;
    }
    out.push(line);
  }
  return out;
}

interface LabeledPath {
  labels: string[];
  path: string;
}

/**
 * The run of label lines immediately preceding each `<keyword> "<path>"`.
 * Blank lines are inert; any other line resets the pending labels (the same
 * stacked-label rule the tileset and blocks loaders rely on).
 */
function stacked(text: string, keyword: "INCBIN" | "INCLUDE"): LabeledPath[] {
  const directive = new RegExp(`^\\s*${keyword}\\s+"([^"]+)"`);
  const labelRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)::?\s*(;.*)?$/;
  const out: LabeledPath[] = [];
  let pending: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.trim() === "") continue;
    const label = line.match(labelRe);
    if (label) {
      pending.push(label[1]!);
      continue;
    }
    const hit = line.match(directive);
    if (hit) {
      out.push({ labels: pending, path: hit[1]! });
      pending = [];
      continue;
    }
    pending = [];
  }
  return out;
}

function labelMap(entries: readonly LabeledPath[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of entries) for (const label of entry.labels) out.set(label, entry.path);
  return out;
}

const readText = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8");

// ---------------------------------------------------------------------------
// GBC oracle: maps, tilesets, grids, borders.
// ---------------------------------------------------------------------------

interface OracleGbcMap {
  name: string;
  constName: string;
  tileset: string;
  blkPath: string;
  border: number;
  width: number;
  height: number;
}

interface OracleGbcTileset {
  constName: string;
  gfxPath: string;
  metatilesPath: string;
  collisionPath: string;
  palMapPath: string;
}

interface OracleGbc {
  root: string;
  maps: OracleGbcMap[];
  /** Keyed by the `TILESET_*` constant, only for constants a map header uses. */
  tilesets: Map<string, OracleGbcTileset>;
  /** Every map name backed by a grid file, sorted. */
  namesByFile: Map<string, string[]>;
  rawBlk(blkPath: string): Buffer;
}

/** `constants/map_constants.asm`: `map_const NAME, w, h`. */
function gbcDims(root: string): Map<string, { width: number; height: number }> {
  const out = new Map<string, { width: number; height: number }>();
  for (const line of codeLines(readText(root, "constants/map_constants.asm"))) {
    const m = stripComment(line).match(/^\s*map_const\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^,]+),\s*([^,\s]+)\s*$/);
    if (!m) continue;
    out.set(m[1]!, { width: num(m[2]!), height: num(m[3]!) });
  }
  return out;
}

/** `data/maps/attributes.asm`: `map_attributes Name, CONST, $border, flags`. */
function gbcAttributes(root: string): Map<string, { constName: string; border: number }> {
  const out = new Map<string, { constName: string; border: number }>();
  for (const line of codeLines(readText(root, "data/maps/attributes.asm"))) {
    const a = call(line, "map_attributes");
    if (!a || a.length < 3) continue;
    out.set(a[0]!, { constName: a[1]!, border: num(a[2]!) });
  }
  return out;
}

/** `data/maps/maps.asm`: `map Name, TILESET_X, ...` (tileset is the second argument). */
function gbcHeaders(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of codeLines(readText(root, "data/maps/maps.asm"))) {
    const m = call(line, "map");
    if (!m || m.length < 2) continue;
    out.set(m[0]!, m[1]!);
  }
  return out;
}

/** `constants/tileset_constants.asm`: `const_def N` / `const NAME` enum. */
function constValues(root: string): Map<string, number> {
  const out = new Map<string, number>();
  let counter = 0;
  for (const line of codeLines(readText(root, "constants/tileset_constants.asm"))) {
    const stripped = stripComment(line);
    const def = stripped.match(/^\s*const_def\b\s*(.*)$/);
    if (def) {
      const arg = def[1]!.trim();
      counter = arg === "" ? 0 : num(arg);
      continue;
    }
    const c = stripped.match(/^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (c) {
      out.set(c[1]!, counter);
      counter++;
    }
  }
  return out;
}

/**
 * Builds the GBC oracle from source text. A map's tileset paths are resolved
 * through the `Tilesets::` table order and the stacked GFX/Meta/Coll/PalMap
 * labels, exactly the relation R5/R6/R7 describe -- but read here, not through
 * `proj.tileset`.
 */
function buildGbcOracle(root: string): OracleGbc {
  const dims = gbcDims(root);
  const attributes = gbcAttributes(root);
  const headers = gbcHeaders(root);
  const blockPaths = labelMap(stacked(readText(root, "data/maps/blocks.asm"), "INCBIN"));

  const maps: OracleGbcMap[] = [];
  for (const [name, attr] of attributes) {
    const tileset = headers.get(name);
    const size = dims.get(attr.constName);
    const blkPath = blockPaths.get(`${name}_Blocks`);
    if (tileset === undefined || size === undefined || blkPath === undefined) {
      throw new Error(
        `oracle: cannot join GBC map ${name} (header ${tileset !== undefined}, ` +
          `dimensions ${size !== undefined}, blocks.asm ${blkPath !== undefined})`,
      );
    }
    maps.push({
      name,
      constName: attr.constName,
      tileset,
      blkPath,
      border: attr.border,
      width: size.width,
      height: size.height,
    });
  }

  const values = constValues(root);
  const table = codeLines(readText(root, "data/tilesets.asm"))
    .map((line) => call(line, "tileset"))
    .filter((argsHere): argsHere is string[] => argsHere !== null && argsHere.length > 0)
    .map((argsHere) => argsHere[0]!);
  const tilesetsAsm = readText(root, "gfx/tilesets.asm");
  const gfxByLabel = labelMap(stacked(tilesetsAsm, "INCBIN"));
  const collByLabel = labelMap(stacked(tilesetsAsm, "INCLUDE"));
  const palMapByLabel = labelMap(stacked(readText(root, "gfx/tileset_palette_maps.asm"), "INCLUDE"));

  const tilesets = new Map<string, OracleGbcTileset>();
  for (const constName of [...new Set(maps.map((m) => m.tileset))].sort(compare)) {
    const index = values.get(constName);
    const name = index === undefined ? undefined : table[index];
    if (name === undefined) throw new Error(`oracle: ${constName} has no Tilesets:: entry`);
    const gfx = gfxByLabel.get(`${name}GFX`);
    const metatiles = gfxByLabel.get(`${name}Meta`);
    const collision = collByLabel.get(`${name}Coll`);
    const palMap = palMapByLabel.get(`${name}PalMap`);
    if (!gfx || !metatiles || !collision || !palMap) {
      throw new Error(`oracle: ${constName} (${name}) lacks one of the GFX/Meta/Coll/PalMap labels`);
    }
    tilesets.set(constName, {
      constName,
      gfxPath: gfx.replace(/\.2bpp\.lz$/, ".png"),
      metatilesPath: metatiles,
      collisionPath: collision,
      palMapPath: palMap,
    });
  }

  const namesByFile = new Map<string, string[]>();
  for (const map of maps) {
    const list = namesByFile.get(map.blkPath) ?? [];
    list.push(map.name);
    namesByFile.set(map.blkPath, list);
  }
  for (const list of namesByFile.values()) list.sort(compare);

  const blkCache = new Map<string, Buffer>();
  return {
    root,
    maps,
    tilesets,
    namesByFile,
    rawBlk: (blkPath) => {
      let bytes = blkCache.get(blkPath);
      if (bytes === undefined) {
        bytes = readFileSync(join(root, blkPath));
        blkCache.set(blkPath, bytes);
      }
      return bytes;
    },
  };
}

let gbcOracleCache: OracleGbc | undefined;
const gbcOracle = (): OracleGbc => (gbcOracleCache ??= buildGbcOracle(GBC_SUBJECT_ROOT));

/** The declared interior grid of one map, i.e. the first w*h `.blk` bytes. */
function diskGrid(o: OracleGbc, map: OracleGbcMap): number[] {
  const bytes = o.rawBlk(map.blkPath);
  const cells = map.width * map.height;
  if (bytes.length < cells) {
    throw new Error(`oracle: ${map.blkPath} is shorter than ${map.name}'s ${map.width}x${map.height}`);
  }
  return [...bytes.subarray(0, cells)];
}

/** R3: for a grid file, the staged grid of the alphabetically first map present wins. */
function effectiveGrid(o: OracleGbc, map: OracleGbcMap, grids: StagedGrids): readonly number[] {
  if (grids.size > 0) {
    const firstName = o.namesByFile.get(map.blkPath)!.find((name) => grids.has(name));
    if (firstName !== undefined) return grids.get(firstName)!;
  }
  return diskGrid(o, map);
}

// ---------------------------------------------------------------------------
// GBC usage oracle: R1-R3 (entries per grid file), R6 (files/tilesets) and R7
// (tile usage).
// ---------------------------------------------------------------------------

interface TileUsage {
  blocks: { metatilesPath: string; ids: number[] }[];
  maps: string[];
}

/** The shape `gbcBlockUsage` / `gbaBlockUsage` returns, named locally so a missing module cannot widen it to `any`. */
interface UsageMap {
  map: string;
  interior: number;
  border: number;
  block0AsBorder: number;
}

interface Usage {
  files: string[];
  tilesets: string[];
  maps: UsageMap[];
  sharedGrids: { file: string; maps: string[] }[];
}

/** The shape `gbaConsumingLayouts` returns, named locally so a missing module cannot widen it to `any`. */
interface GbaLayoutUse {
  layout: string;
  role: "primary" | "secondary";
  split: Split;
  pairedWith: string;
}

function gbcUsageOracle(o: OracleGbc, metatilesPath: string, id: number, grids: StagedGrids): Usage {
  const tilesets = [...o.tilesets.values()]
    .filter((ts) => ts.metatilesPath === metatilesPath)
    .map((ts) => ts.constName)
    .sort(compare);
  if (tilesets.length === 0) throw new Error(`oracle: no used tileset resolves ${metatilesPath}`);

  const byFile = new Map<string, OracleGbcMap[]>();
  for (const map of o.maps) {
    if (!tilesets.includes(map.tileset)) continue;
    const group = byFile.get(map.blkPath) ?? [];
    group.push(map);
    byFile.set(map.blkPath, group);
  }

  const maps: UsageMap[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  for (const [file, group] of byFile) {
    group.sort((a, b) => compare(a.name, b.name));
    // One entry per file uses the representative (alphabetically first) map's
    // header for both `map` and the border, per R2.
    const rep = group[0]!;
    const grid = effectiveGrid(o, rep, grids);
    let interior = 0;
    let zeros = 0;
    for (const cell of grid) {
      if (cell === id) interior++;
      if (cell === 0) zeros++;
    }
    const border = rep.border === id ? 1 : 0;
    const block0AsBorder = border === 1 && id !== 0 ? zeros : 0;
    if (interior + border + block0AsBorder === 0) continue;
    maps.push({ map: rep.name, interior, border, block0AsBorder });

    const names = o.namesByFile.get(file)!;
    if (names.length >= 2) sharedGrids.push({ file, maps: [...names] });
  }
  maps.sort((a, b) => compare(a.map, b.map));

  const files = [...new Set([metatilesPath, ...tilesets.map((c) => o.tilesets.get(c)!.collisionPath)])].sort(compare);
  return { files, tilesets, maps, sharedGrids };
}

/** The block ids in one metatiles file whose 16 tile bytes contain `tileId`. */
function tileBlockIds(root: string, metatilesPath: string, tileId: number): number[] {
  const bytes = readFileSync(join(root, metatilesPath));
  const out: number[] = [];
  for (let offset = 0; offset + 16 <= bytes.length; offset += 16) {
    if (bytes.subarray(offset, offset + 16).includes(tileId)) out.push(offset / 16);
  }
  return out;
}

function gbcTileUsageOracle(o: OracleGbc, palMapPath: string, tileId: number, grids: StagedGrids): TileUsage {
  const tilesets = [...o.tilesets.values()].filter((ts) => ts.palMapPath === palMapPath);
  const metatilesPaths = [...new Set(tilesets.map((ts) => ts.metatilesPath))].sort(compare);

  const blocks: { metatilesPath: string; ids: number[] }[] = [];
  const idsByFile = new Map<string, Set<number>>();
  for (const path of metatilesPaths) {
    const ids = tileBlockIds(o.root, path, tileId);
    if (ids.length === 0) continue;
    blocks.push({ metatilesPath: path, ids });
    idsByFile.set(path, new Set(ids));
  }

  const consts = new Set(tilesets.map((ts) => ts.constName));
  const found: string[] = [];
  for (const map of o.maps) {
    if (!consts.has(map.tileset)) continue;
    const ids = idsByFile.get(o.tilesets.get(map.tileset)!.metatilesPath);
    if (ids === undefined) continue;
    const grid = effectiveGrid(o, map, grids);
    if (grid.some((cell) => ids.has(cell)) || ids.has(map.border)) found.push(map.name);
  }
  return { blocks, maps: [...new Set(found)].sort(compare) };
}

/** Most frequent present cell id (ties broken by the smaller id). */
function mostFrequent(cells: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (best === undefined) throw new Error("oracle: empty grid");
  return best[0];
}

/** Rare but present cell id, so a fully staged grid counts more cells than disk. */
function leastFrequent(cells: readonly number[]): { id: number; count: number } {
  const counts = new Map<number, number>();
  for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  const best = [...counts].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  if (best === undefined) throw new Error("oracle: empty grid");
  return { id: best[0], count: best[1] };
}

/** Tile ids of one metatiles file, most frequent first (the fixture scan for R7). */
function tileCandidates(root: string, metatilesPath: string): number[] {
  const bytes = readFileSync(join(root, metatilesPath));
  const counts = new Map<number, number>();
  for (let offset = 0; offset + 16 <= bytes.length; offset += 16) {
    for (const tile of bytes.subarray(offset, offset + 16)) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 12)
    .map(([tile]) => tile);
}

interface GbcTileFixture {
  palMapPath: string;
  tileId: number;
  map: OracleGbcMap;
  nonContainingId: number;
}

/**
 * Picks a palette-map path, a tile id and a map that draws a block containing
 * that tile. The staged counterexample for that map is a block id that does
 * not contain the tile and is not the map's border.
 */
function chooseGbcTileFixture(o: OracleGbc): GbcTileFixture {
  const byPalMap = new Map<string, OracleGbcTileset[]>();
  for (const ts of o.tilesets.values()) {
    const list = byPalMap.get(ts.palMapPath) ?? [];
    list.push(ts);
    byPalMap.set(ts.palMapPath, list);
  }
  const groups = [...byPalMap]
    .map(([palMapPath, tilesets]) => ({
      palMapPath,
      tilesets,
      maps: o.maps.filter((map) => tilesets.some((ts) => ts.constName === map.tileset)),
    }))
    .filter((group) => group.maps.length > 0)
    .sort((a, b) => b.maps.length - a.maps.length);

  for (const group of groups) {
    const metatilesPaths = [...new Set(group.tilesets.map((ts) => ts.metatilesPath))].sort(compare);
    for (const metatilesPath of metatilesPaths) {
      for (const tileId of tileCandidates(o.root, metatilesPath)) {
        const expected = gbcTileUsageOracle(o, group.palMapPath, tileId, new Map());
        for (const name of expected.maps) {
          const map = o.maps.find((m) => m.name === name)!;
          const ts = o.tilesets.get(map.tileset)!;
          if (ts.palMapPath !== group.palMapPath) continue;
          const containing = new Set(tileBlockIds(o.root, ts.metatilesPath, tileId));
          if (containing.has(map.border)) continue;
          const nonContainingId = Array.from({ length: 256 }, (_, i) => i)
            .find((id) => !containing.has(id) && id !== map.border);
          if (nonContainingId === undefined) continue;
          return { palMapPath: group.palMapPath, tileId, map, nonContainingId };
        }
      }
    }
  }
  throw new Error("oracle fixture: no palette-map / tile / block combination found");
}

// ---------------------------------------------------------------------------
// GBA oracle: layouts.json, map.json, map.bin and border.bin as raw u16 cells.
// ---------------------------------------------------------------------------

interface OracleGbaLayout {
  id: string;
  primaryTileset: string;
  secondaryTileset: string;
  borderFilepath: string;
  blockdataFilepath: string;
}

interface OracleGbaMap {
  name: string;
  layout: string;
}

interface OracleGba {
  root: string;
  layouts: OracleGbaLayout[];
  maps: OracleGbaMap[];
  /** Every u16 little-endian cell's metatile id (masked to 10 bits), cached. */
  cells(rel: string): number[];
}

function buildGbaOracle(root: string): OracleGba {
  const parsed = JSON.parse(readText(root, "data/layouts/layouts.json")) as {
    layouts?: Record<string, unknown>[];
  };
  const layouts: OracleGbaLayout[] = [];
  for (const raw of parsed.layouts ?? []) {
    if (raw.id === undefined || raw.id === null) continue;
    layouts.push({
      id: String(raw.id),
      primaryTileset: String(raw.primary_tileset),
      secondaryTileset: String(raw.secondary_tileset),
      borderFilepath: String(raw.border_filepath),
      blockdataFilepath: String(raw.blockdata_filepath),
    });
  }

  const groups = JSON.parse(readText(root, "data/maps/map_groups.json")) as Record<string, unknown>;
  const order = Array.isArray(groups.group_order) ? groups.group_order.map(String) : [];
  const maps: OracleGbaMap[] = [];
  for (const group of order) {
    const list = groups[group];
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      const label = String(name);
      const file = join(root, "data/maps", label, "map.json");
      if (!existsSync(file)) continue;
      const raw = JSON.parse(readFileSync(file, "utf8")) as { layout?: unknown };
      if (typeof raw.layout !== "string") continue;
      maps.push({ name: label, layout: raw.layout });
    }
  }

  const cache = new Map<string, number[]>();
  return {
    root,
    layouts,
    maps,
    cells: (rel) => {
      let cells = cache.get(rel);
      if (cells === undefined) {
        const bytes = readFileSync(join(root, rel));
        cells = [];
        for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
          cells.push(bytes.readUInt16LE(offset) & 0x3ff);
        }
        cache.set(rel, cells);
      }
      return cells;
    },
  };
}

let gbaOracleCache: OracleGba | undefined;
const gbaOracle = (): OracleGba => (gbaOracleCache ??= buildGbaOracle(SUBJECT_ROOT));

/**
 * R8/R9: every consuming layout, with its role; the per-layout target id is
 * `localIndex` for a primary and `split.metatiles + localIndex` for a
 * secondary. Splits are taken from the project (`proj.splitFor`), which the
 * brief excludes from the oracle.
 */
function gbaUsageOracle(
  proj: Project,
  o: OracleGba,
  symbol: string,
  localIndex: number,
  grids: StagedGrids,
): Usage {
  const byFile = new Map<string, { target: number; layout: OracleGbaLayout; names: string[] }>();
  for (const layout of o.layouts) {
    const role = layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
    if (role === undefined) continue;
    const names = o.maps.filter((map) => map.layout === layout.id).map((map) => map.name).sort(compare);
    if (names.length === 0) continue;
    const loaded = proj.layoutById(layout.id);
    if (!loaded) throw new Error(`oracle: layout ${layout.id} is not in the project`);
    const split = proj.splitFor(loaded);
    const target = role === "primary" ? localIndex : split.metatiles + localIndex;

    const existing = byFile.get(layout.blockdataFilepath);
    if (existing === undefined) {
      byFile.set(layout.blockdataFilepath, { target, layout, names });
    } else {
      // Layouts sharing one blockdata file would need one target; refuse to
      // guess instead of silently picking the first.
      if (existing.target !== target) {
        throw new Error(`oracle: shared blockdata ${layout.blockdataFilepath} has two target ids`);
      }
      existing.names = [...new Set([...existing.names, ...names])].sort(compare);
    }
  }

  const maps: UsageMap[] = [];
  for (const [file, group] of byFile) {
    const stagedName = grids.size > 0 ? group.names.find((name) => grids.has(name)) : undefined;
    const grid = stagedName === undefined ? o.cells(file) : grids.get(stagedName)!;
    const border = o.cells(group.layout.borderFilepath);
    let interior = 0;
    for (const cell of grid) if (cell === group.target) interior++;
    let borderCount = 0;
    for (const cell of border) if (cell === group.target) borderCount++;
    if (interior + borderCount === 0) continue;
    maps.push({ map: group.names[0]!, interior, border: borderCount, block0AsBorder: 0 });
  }
  maps.sort((a, b) => compare(a.map, b.map));
  return { files: [], tilesets: [symbol], maps, sharedGrids: [] };
}

/**
 * Picks a local id this tileset actually contributes to some consuming layout,
 * together with that layout's first map. The chosen id must occur in the grid
 * but not fill it, so staging the grid to that id changes the interior count.
 */
function chooseGbaId(
  o: OracleGba,
  proj: Project,
  symbol: string,
  wanted?: "primary" | "secondary",
): { localIndex: number; layout: OracleGbaLayout; map: string } {
  for (const layout of o.layouts) {
    const role = layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
    if (role === undefined) continue;
    if (wanted !== undefined && role !== wanted) continue;
    const names = o.maps
      .filter((map) => map.layout === layout.id)
      .map((map) => map.name)
      .sort(compare);
    const cells = o.cells(layout.blockdataFilepath);
    if (names.length === 0 || cells.length === 0) continue;

    const loaded = proj.layoutById(layout.id);
    if (!loaded) continue;
    const split = proj.splitFor(loaded);
    const base = role === "primary" ? 0 : split.metatiles;
    const limit = role === "primary" ? split.metatiles : Number.POSITIVE_INFINITY;

    const counts = new Map<number, number>();
    for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    for (const [cell, count] of counts) {
      if (cell >= base && cell < limit && count < cells.length) {
        return { localIndex: cell - base, layout, map: names[0]! };
      }
    }
  }
  throw new Error(`oracle: ${symbol} has no partially drawn local id in any consuming layout`);
}

// ---------------------------------------------------------------------------
// GBC corpus tests.
// ---------------------------------------------------------------------------

describe("GBC block usage", () => {
  itWithGbcCorpus("Cave and DarkCave share one metatiles file, and usage names maps of both", () => {
    const o = gbcOracle();
    const cave = o.tilesets.get("TILESET_CAVE");
    const dark = o.tilesets.get("TILESET_DARK_CAVE");
    expect(cave, "the subject uses TILESET_CAVE").toBeDefined();
    expect(dark, "the subject uses TILESET_DARK_CAVE").toBeDefined();
    const cavePath = cave!.metatilesPath;
    expect(dark!.metatilesPath, "both cave tilesets resolve the same metatiles file").toBe(cavePath);

    const expectedTilesets = [...o.tilesets.values()]
      .filter((ts) => [ts.gfxPath, ts.metatilesPath, ts.collisionPath, ts.palMapPath].includes(cavePath))
      .map((ts) => ts.constName)
      .sort(compare);
    expect(expectedTilesets).toContain("TILESET_CAVE");
    expect(expectedTilesets).toContain("TILESET_DARK_CAVE");

    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(gbcTilesetsForFile(proj, cavePath)).toEqual(expectedTilesets);

    const caveMaps = o.maps.filter((map) => map.tileset === "TILESET_CAVE");
    const darkMaps = o.maps.filter((map) => map.tileset === "TILESET_DARK_CAVE");
    expect(caveMaps.length, "maps use TILESET_CAVE").toBeGreaterThan(0);
    expect(darkMaps.length, "maps use TILESET_DARK_CAVE").toBeGreaterThan(0);

    // A block id that a Cave map and a DarkCave map both draw.
    const darkIds = new Set<number>();
    for (const map of darkMaps) for (const cell of diskGrid(o, map)) darkIds.add(cell);
    let id: number | undefined;
    for (const map of caveMaps) {
      for (const cell of diskGrid(o, map)) {
        if (darkIds.has(cell)) {
          id = cell;
          break;
        }
      }
      if (id !== undefined) break;
    }
    expect(id, "a block id shared by a Cave map and a DarkCave map").toBeDefined();

    const usage: Usage = gbcBlockUsage(proj, cavePath, id!, new Map());
    const expected = gbcUsageOracle(o, cavePath, id!, new Map());
    expect(usage.tilesets).toEqual(expectedTilesets);
    expect(usage.files).toEqual(expected.files);
    expect(usage.maps).toEqual(expected.maps);
    expect(usage.maps.length).toBeGreaterThan(0);

    const listed = new Set(usage.maps.map((entry) => entry.map));
    expect([...listed].some((name) => caveMaps.some((map) => map.name === name)), "a Cave map is listed").toBe(true);
    expect([...listed].some((name) => darkMaps.some((map) => map.name === name)), "a DarkCave map is listed").toBe(true);
  });

  itWithGbcCorpus("a shared .blk is counted once and names every map that uses it", () => {
    const o = gbcOracle();
    const file = "maps/PortPassage.blk";
    const names = o.namesByFile.get(file);
    expect(names, "PortPassage.blk exists in blocks.asm").toBeDefined();
    expect(names).toEqual(["OlivinePortPassage", "VermilionPortPassage"]);

    const olivine = o.maps.find((map) => map.name === "OlivinePortPassage")!;
    const vermilion = o.maps.find((map) => map.name === "VermilionPortPassage")!;
    expect(vermilion.tileset).toBe(olivine.tileset);

    const grid = diskGrid(o, olivine);
    const id = mostFrequent(grid);
    const diskCount = grid.filter((cell) => cell === id).length;
    expect(diskCount).toBeGreaterThan(0);

    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const ts = o.tilesets.get(olivine.tileset)!;
    const usage: Usage = gbcBlockUsage(proj, ts.metatilesPath, id, new Map());

    const expected = gbcUsageOracle(o, ts.metatilesPath, id, new Map());
    const entries = usage.maps.filter((entry: UsageMap) => names!.includes(entry.map));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expected.maps.find((entry) => entry.map === "OlivinePortPassage"));
    expect(entries[0]!.interior).toBe(diskCount);
    expect(entries[0]!.interior).not.toBe(diskCount * 2);

    expect(usage.sharedGrids.find((shared: { file: string; maps: string[] }) => shared.file === file)).toEqual({
      file,
      maps: ["OlivinePortPassage", "VermilionPortPassage"],
    });
  });

  itWithGbcCorpus("a staged raw block 0 is interior for id 0 and block-0-as-border for the border block", () => {
    const o = gbcOracle();
    // The subject stores no block-0 cells on disk, so this stages one: a raw
    // cell value of 0 must count as the border block only when the queried
    // id IS that border (and is not 0 itself), never as a silent substitution.
    const candidates = o.maps.filter(
      (map) => o.namesByFile.get(map.blkPath)!.length === 1 && map.border !== 0,
    );
    expect(candidates.length, "a sole-owner map with a non-zero border").toBeGreaterThan(0);
    const map = candidates[0]!;
    const area = map.width * map.height;
    const staged = new Map<string, number[]>([[map.name, Array.from({ length: area }, () => 0)]]);
    const ts = o.tilesets.get(map.tileset)!;
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    const borderUsage: Usage = gbcBlockUsage(proj, ts.metatilesPath, map.border, staged);
    const borderExpected = gbcUsageOracle(o, ts.metatilesPath, map.border, staged);
    expect(borderUsage.maps).toEqual(borderExpected.maps);
    const borderEntry = borderUsage.maps.find((entry: UsageMap) => entry.map === map.name);
    expect(borderEntry, `an entry for ${map.name}`).toBeDefined();
    expect(borderEntry!.interior).toBe(0);
    expect(borderEntry!.border).toBe(1);
    expect(borderEntry!.block0AsBorder).toBe(area);

    const zeroUsage: Usage = gbcBlockUsage(proj, ts.metatilesPath, 0, staged);
    const zeroExpected = gbcUsageOracle(o, ts.metatilesPath, 0, staged);
    expect(zeroUsage.maps).toEqual(zeroExpected.maps);
    const zeroEntry = zeroUsage.maps.find((entry: UsageMap) => entry.map === map.name);
    expect(zeroEntry, `an entry for ${map.name} at id 0`).toBeDefined();
    expect(zeroEntry!.interior).toBe(area);
    expect(zeroEntry!.block0AsBorder).toBe(0);
  });

  itWithGbcCorpus("the whole maps list for a metatiles file matches the oracle", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    // The file with the most consuming maps makes the strongest comparison.
    let best: { path: string; maps: OracleGbcMap[] } | undefined;
    for (const path of [...new Set([...o.tilesets.values()].map((ts) => ts.metatilesPath))]) {
      const consts = [...o.tilesets.values()].filter((ts) => ts.metatilesPath === path).map((ts) => ts.constName);
      const maps = o.maps.filter((map) => consts.includes(map.tileset));
      if (best === undefined || maps.length > best.maps.length) best = { path, maps };
    }
    expect(best).toBeDefined();

    const counts = new Map<number, number>();
    for (const map of best!.maps) {
      for (const cell of diskGrid(o, map)) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
    const id = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];

    const usage: Usage = gbcBlockUsage(proj, best!.path, id, new Map());
    const expected = gbcUsageOracle(o, best!.path, id, new Map());
    expect(usage.files).toEqual(expected.files);
    expect(usage.tilesets).toEqual(expected.tilesets);
    expect(usage.maps).toEqual(expected.maps);
    expect(usage.maps.length).toBeGreaterThan(0);
  });

  itWithGbcCorpus("a staged grid overrides the disk count, including the second alias of a shared grid", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    const sole = o.maps.filter((map) => o.namesByFile.get(map.blkPath)!.length === 1);
    const map = sole.find((m) => diskGrid(o, m).length > 0);
    expect(map, "a map that owns its .blk and has a non-empty grid").toBeDefined();
    const own = map!;
    const ts = o.tilesets.get(own.tileset)!;
    const id = mostFrequent(diskGrid(o, own));
    const area = own.width * own.height;
    const staged = new Map<string, number[]>([[own.name, Array.from({ length: area }, () => id)]]);

    const usage: Usage = gbcBlockUsage(proj, ts.metatilesPath, id, staged);
    expect(usage.maps).toEqual(gbcUsageOracle(o, ts.metatilesPath, id, staged).maps);
    const entry = usage.maps.find((e: UsageMap) => e.map === own.name);
    expect(entry, `an entry for ${own.name}`).toBeDefined();
    expect(entry!.interior).toBe(area);

    // R3: only VermilionPortPassage is staged, but the file's single entry
    // (named OlivinePortPassage) still uses the staged grid.
    const file = "maps/PortPassage.blk";
    expect(o.namesByFile.get(file)).toEqual(["OlivinePortPassage", "VermilionPortPassage"]);
    const second = o.maps.find((m) => m.name === "VermilionPortPassage")!;
    const secondTs = o.tilesets.get(second.tileset)!;
    const secondArea = second.width * second.height;
    const secondId = mostFrequent(diskGrid(o, second));
    const aliasStaged = new Map<string, number[]>([
      ["VermilionPortPassage", Array.from({ length: secondArea }, () => secondId)],
    ]);

    const aliasUsage: Usage = gbcBlockUsage(proj, secondTs.metatilesPath, secondId, aliasStaged);
    expect(aliasUsage.maps).toEqual(gbcUsageOracle(o, secondTs.metatilesPath, secondId, aliasStaged).maps);
    const aliasEntry = aliasUsage.maps.find((e: UsageMap) => e.map === "OlivinePortPassage");
    expect(aliasEntry, "the shared file's entry is named after the first alias").toBeDefined();
    expect(aliasEntry!.interior).toBe(secondArea);
  });

  itWithGbcCorpus("counts are never cached across calls on the same project object", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    const sole = o.maps.filter((map) => {
      if (o.namesByFile.get(map.blkPath)!.length !== 1 || map.width * map.height <= 1) return false;
      const grid = diskGrid(o, map);
      return leastFrequent(grid).count < grid.length;
    });
    let pair: [OracleGbcMap, OracleGbcMap] | undefined;
    outer: for (const a of sole) {
      for (const b of sole) {
        if (a === b) continue;
        if (o.tilesets.get(a.tileset)!.metatilesPath !== o.tilesets.get(b.tileset)!.metatilesPath) continue;
        pair = [a, b];
        break outer;
      }
    }
    expect(pair, "two sole-owner maps sharing one metatiles file").toBeDefined();
    const [a, b] = pair!;
    const ts = o.tilesets.get(a.tileset)!;

    const rare = leastFrequent(diskGrid(o, a));
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    expect(rare.count).toBeLessThan(areaA);

    const gridsA = new Map<string, number[]>([[a.name, Array.from({ length: areaA }, () => rare.id)]]);
    const gridsB = new Map<string, number[]>([[b.name, Array.from({ length: areaB }, () => rare.id)]]);

    const disk = gbcUsageOracle(o, ts.metatilesPath, rare.id, new Map());
    const u1: Usage = gbcBlockUsage(proj, ts.metatilesPath, rare.id, gridsA);
    const u2: Usage = gbcBlockUsage(proj, ts.metatilesPath, rare.id, gridsB);
    const u3: Usage = gbcBlockUsage(proj, ts.metatilesPath, rare.id, new Map());

    expect(u1.maps).toEqual(gbcUsageOracle(o, ts.metatilesPath, rare.id, gridsA).maps);
    expect(u2.maps).toEqual(gbcUsageOracle(o, ts.metatilesPath, rare.id, gridsB).maps);

    const a1 = u1.maps.find((e: UsageMap) => e.map === a.name);
    const a2 = u2.maps.find((e: UsageMap) => e.map === a.name);
    expect(a1, `a staged entry for ${a.name}`).toBeDefined();
    expect(a1!.interior).toBe(areaA);
    expect(a2, `the disk entry for ${a.name} after staging ${b.name}`).toBeDefined();
    expect(a2!.interior).toBe(rare.count);
    expect(a1!.interior).not.toBe(a2!.interior);

    const b2 = u2.maps.find((e: UsageMap) => e.map === b.name);
    expect(b2, `a staged entry for ${b.name}`).toBeDefined();
    expect(b2!.interior).toBe(areaB);

    expect(u3.maps).toEqual(disk.maps);
  });

  itWithGbcCorpus("gbcTileUsage lists block ids per file and removes a map whose staged grid no longer draws one", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const fixture = chooseGbcTileFixture(o);

    const before: TileUsage = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, new Map());
    const expected = gbcTileUsageOracle(o, fixture.palMapPath, fixture.tileId, new Map());
    expect(before.blocks).toEqual(expected.blocks);
    expect(before.maps).toEqual(expected.maps);
    expect(before.blocks.length).toBeGreaterThan(0);
    expect(before.maps).toContain(fixture.map.name);

    const area = fixture.map.width * fixture.map.height;
    const staged = new Map<string, number[]>([
      [fixture.map.name, Array.from({ length: area }, () => fixture.nonContainingId)],
    ]);
    const after: TileUsage = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, staged);
    expect(after).toEqual(gbcTileUsageOracle(o, fixture.palMapPath, fixture.tileId, staged));
    expect(after.maps).not.toContain(fixture.map.name);
  });

  itWithGbcCorpus("an unknown file path resolves to no tilesets", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(gbcTilesetsForFile(proj, "nope/missing.bin")).toEqual([]);
  });

});

describe("GBA block usage", () => {
  itWithCorpus("gbaConsumingLayouts lists both roles, and gbaBlockUsage counts every consuming layout", () => {
    const o = gbaOracle();
    const proj = openProject(SUBJECT_ROOT);
    const symbol = "gTileset_General";

    const consuming: GbaLayoutUse[] = gbaConsumingLayouts(proj, symbol);
    const expected = o.layouts
      .map((layout) => {
        const role: "primary" | "secondary" | undefined =
          layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
        return role === undefined ? undefined : { layout, role };
      })
      .filter((entry): entry is { layout: OracleGbaLayout; role: "primary" | "secondary" } => entry !== undefined)
      .sort((a, b) => compare(a.layout.id, b.layout.id));

    expect(consuming.map((e) => e.layout)).toEqual(expected.map((e) => e.layout.id));
    for (const [i, entry] of consuming.entries()) {
      const want = expected[i]!;
      expect(entry.role).toBe(want.role);
      const loaded = proj.layoutById(want.layout.id);
      expect(loaded, `layout ${want.layout.id}`).toBeDefined();
      expect(entry.split).toEqual(proj.splitFor(loaded!));
      expect(entry.pairedWith).toBe(
        want.role === "primary" ? want.layout.secondaryTileset : want.layout.primaryTileset,
      );
    }
    // The subject holds layouts under both metatile splits (Emerald 512 vs
    // FRLG/HNS 640), so the same local id means two different global ids.
    expect(new Set(consuming.map((e) => e.split.metatiles)).size).toBe(2);

    const pick = chooseGbaId(o, proj, symbol);
    const localIndex = pick.localIndex;
    const expectedUsage = gbaUsageOracle(proj, o, symbol, localIndex, new Map());
    const usage: Usage = gbaBlockUsage(proj, symbol, localIndex, new Map());
    expect(usage.tilesets).toEqual([symbol]);
    expect(usage.maps).toEqual(expectedUsage.maps);
    // R9: the two per-symbol binaries, by resolved path, sorted.
    expect(usage.files).toHaveLength(2);
    expect([...usage.files].sort(compare)).toEqual(usage.files);
    expect(usage.files.some((f) => /metatiles\.bin$/.test(f))).toBe(true);
    expect(usage.files.some((f) => /metatile_attributes\.bin$/.test(f))).toBe(true);
    for (const f of usage.files) expect(existsSync(join(SUBJECT_ROOT, f)), f).toBe(true);

    // Staging every cell of the picked layout's grid to the target id raises
    // that grid's interior count without relying on any cached count.
    const stagedSplit = proj.splitFor(proj.layoutById(pick.layout.id)!);
    const target = pick.layout.primaryTileset === symbol ? localIndex : stagedSplit.metatiles + localIndex;
    const area = o.cells(pick.layout.blockdataFilepath).length;
    const grids = new Map<string, number[]>([[pick.map, Array.from({ length: area }, () => target)]]);

    const stagedUsage: Usage = gbaBlockUsage(proj, symbol, localIndex, grids);
    expect(stagedUsage.maps).toEqual(gbaUsageOracle(proj, o, symbol, localIndex, grids).maps);
    const entry = stagedUsage.maps.find((e) => e.map === pick.map);
    expect(entry, `the staged entry for ${pick.map}`).toBeDefined();
    expect(entry!.interior).toBe(area);
  });

  itWithCorpus("gbaBlockUsage translates a secondary tileset id through each layout's split", () => {
    const o = gbaOracle();
    const proj = openProject(SUBJECT_ROOT);
    const symbols = [...new Set(o.layouts.map((l) => l.secondaryTileset))].sort(compare);
    const chosen = symbols
      .map((s) => {
        try {
          return { symbol: s, pick: chooseGbaId(o, proj, s, "secondary") };
        } catch {
          return undefined;
        }
      })
      .find((entry) => entry !== undefined);
    expect(chosen, "a secondary tileset drawn by a consuming layout").toBeDefined();
    const secondary = chosen!.symbol;
    const localIndex = chosen!.pick.localIndex;

    const consuming: GbaLayoutUse[] = gbaConsumingLayouts(proj, secondary);
    const expected = o.layouts
      .map((layout) => {
        const role: "primary" | "secondary" | undefined =
          layout.primaryTileset === secondary ? "primary" : layout.secondaryTileset === secondary ? "secondary" : undefined;
        return role === undefined ? undefined : { layout, role };
      })
      .filter((entry): entry is { layout: OracleGbaLayout; role: "primary" | "secondary" } => entry !== undefined)
      .sort((a, b) => compare(a.layout.id, b.layout.id));

    expect(consuming.map((e) => e.layout)).toEqual(expected.map((e) => e.layout.id));
    for (const [i, entry] of consuming.entries()) {
      const want = expected[i]!;
      expect(entry.role).toBe(want.role);
      if (want.role === "secondary") {
        expect(entry.pairedWith).toBe(want.layout.primaryTileset);
      }
      expect(entry.split).toEqual(proj.splitFor(proj.layoutById(want.layout.id)!));
    }

    const expectedUsage = gbaUsageOracle(proj, o, secondary, localIndex, new Map());
    const usage: Usage = gbaBlockUsage(proj, secondary, localIndex, new Map());
    expect(usage.tilesets).toEqual([secondary]);
    expect(expectedUsage.maps.length, "a scanned id that a consuming grid actually draws").toBeGreaterThan(0);
    expect(usage.maps).toEqual(expectedUsage.maps);
  });
});

