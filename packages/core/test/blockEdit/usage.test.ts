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

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openGbcProject } from "../../src/gbc/project.js";
import { openProject, type Project } from "../../src/project.js";
import type { StagedGrids } from "../../src/blockEdit/types.js";
import type { Layout, Split } from "../../src/model/types.js";
import { planGbaBlockEdit, type GbaBlockDraft } from "../../src/blockEdit/gbaOps.js";
import {
  gbaBlockUsage,
  gbaConsumingLayouts,
  gbcBlockUsage,
  gbcTileUsage,
  gbcTilesetsForFile,
} from "../../src/blockEdit/usage.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { makeGbaFixture } from "./gbaFixture.js";

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
// (tile usage). Updated for R2a.
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

/** R2a: interior from representative's effective grid; border/block0AsBorder summed over ALL consuming maps. */
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
    const rep = group[0]!;

    // Interior: use representative's effective grid only (per R3, one grid per file)
    const repGrid = effectiveGrid(o, rep, grids);
    let interior = 0;
    for (const cell of repGrid) {
      if (cell === id) interior++;
    }

    // R2a: border and block0AsBorder summed over EVERY consuming map of the grid file
    let border = 0;
    let block0AsBorder = 0;
    for (const map of group) {
      if (map.border === id) {
        border++;
        if (id !== 0) {
          const grid = effectiveGrid(o, map, grids);
          for (const cell of grid) {
            if (cell === 0) block0AsBorder++;
          }
        }
      }
    }
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
 * R8a/R9a: every consuming layout, with its role; the per-layout target id is
 * `localIndex` for a primary and `split.metatiles + localIndex` for a
 * secondary. Splits are taken from the project (`proj.splitFor`), which the
 * brief excludes from the oracle.
 * R9a: per-file counting with distinct targets and distinct (border file, target) pairs.
 * sharedGrids: maps of ALL layouts on the file (consuming or not), when 2+.
 */
function gbaUsageOracle(
  proj: Project,
  o: OracleGba,
  symbol: string,
  localIndex: number,
  grids: StagedGrids,
): Usage {
  const byFile = new Map<string, {
    targets: Set<number>;
    borderTargets: Map<string, Set<number>>;
    allMapNames: string[];
    consumingMapNames: string[];
  }>();

  for (const layout of o.layouts) {
    const role = layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
    if (role === undefined) continue;
    const names = o.maps.filter((map) => map.layout === layout.id).map((map) => map.name).sort(compare);
    if (names.length === 0) continue;
    const loaded = proj.layoutById(layout.id);
    if (!loaded) throw new Error(`oracle: layout ${layout.id} is not in the project`);
    const split = proj.splitFor(loaded);
    const target = role === "primary" ? localIndex : split.metatiles + localIndex;

    // Gather all maps of ALL layouts on this file for sharedGrids
    const allLayoutsOnFile = o.layouts.filter(l => l.blockdataFilepath === layout.blockdataFilepath);
    const allMapNames: string[] = [];
    for (const l of allLayoutsOnFile) {
      const maps = o.maps.filter(m => m.layout === l.id).map(m => m.name);
      allMapNames.push(...maps);
    }
    allMapNames.sort(compare);

    const existing = byFile.get(layout.blockdataFilepath);
    if (existing === undefined) {
      byFile.set(layout.blockdataFilepath, {
        targets: new Set([target]),
        borderTargets: new Map([[layout.borderFilepath, new Set([target])]]),
        allMapNames,
        consumingMapNames: [...names],
      });
    } else {
      existing.targets.add(target);
      const borderSet = existing.borderTargets.get(layout.borderFilepath) ?? new Set<number>();
      borderSet.add(target);
      existing.borderTargets.set(layout.borderFilepath, borderSet);
      existing.consumingMapNames = [...new Set([...existing.consumingMapNames, ...names])].sort(compare);
    }
  }

  const maps: UsageMap[] = [];
  const sharedGrids: { file: string; maps: string[] }[] = [];
  for (const [file, group] of byFile) {
    const stagedName = grids.size > 0 ? group.allMapNames.find((name) => grids.has(name)) : undefined;
    const grid = stagedName === undefined ? o.cells(file) : grids.get(stagedName)!;

    // Interior: sum over DISTINCT targets
    let interior = 0;
    for (const target of group.targets) {
      for (const cell of grid) if (cell === target) interior++;
    }

    // Border: sum over DISTINCT (borderFilepath, target) pairs
    let border = 0;
    for (const [borderFile, targets] of group.borderTargets) {
      const borderCells = o.cells(borderFile);
      for (const target of targets) {
        for (const cell of borderCells) if (cell === target) border++;
      }
    }

    if (interior + border === 0) continue;
    const representative = group.consumingMapNames[0]!;
    maps.push({ map: representative, interior, border, block0AsBorder: 0 });

    // R9a: sharedGrids = ALL maps of ALL layouts on the file, when 2+
    if (group.allMapNames.length >= 2) {
      sharedGrids.push({ file, maps: [...group.allMapNames] });
    }
  }
  maps.sort((a, b) => compare(a.map, b.map));
  sharedGrids.sort((a, b) => compare(a.file, b.file));

  // Parse headers.h and metatiles.h to get the two paths for this symbol
  const files = parseGbaTilesetFiles(o.root, symbol);
  return { files, tilesets: [symbol], maps, sharedGrids };
}

/** Parse GBA tileset files from headers.h and metatiles.h */
function parseGbaTilesetFiles(root: string, symbol: string): string[] {
  const headersPath = join(root, "src/data/tilesets/headers.h");
  const metatilesPath = join(root, "src/data/tilesets/metatiles.h");
  

  const headersText = readFileSync(headersPath, "utf8");
  const metatilesText = readFileSync(metatilesPath, "utf8");

  // Find the tileset struct for this symbol in headers.h
  // Pattern: const struct Tileset gTileset_General = { ... .metatiles = gMetatiles_X, .metatileAttributes = gMetatileAttributes_X ... }
  const tilesetRegex = new RegExp(`const\\s+struct\\s+Tileset\\s+${symbol}\\s*=\\s*\\{[^}]*\\.metatiles\\s*=\\s*([^,]+),[^}]*\\.metatileAttributes\\s*=\\s*([^,}]+)`, 's');
  const headersMatch = headersText.match(tilesetRegex);
  if (!headersMatch) throw new Error(`oracle: no Tileset struct for ${symbol} in headers.h`);

  const metatilesSymbol = headersMatch[1]!.trim();
  const attributesSymbol = headersMatch[2]!.trim();

  // Find the INCBIN paths in metatiles.h
  // Pattern: const u16 gMetatiles_X[] = INCBIN_U16("path");
  const metatilesRegex = new RegExp(`const\\s+u16\\s+${metatilesSymbol}\\s*\\[\\]\\s*=\\s*INCBIN_U16\\("([^"]+)"\\)`);
  const attributesRegex = new RegExp(`const\\s+u16\\s+${attributesSymbol}\\s*\\[\\]\\s*=\\s*INCBIN_U16\\("([^"]+)"\\)`);

  const metatilesMatch = metatilesText.match(metatilesRegex);
  const attributesMatch = metatilesText.match(attributesRegex);

  if (!metatilesMatch || !attributesMatch) throw new Error(`oracle: no INCBIN for ${symbol}'s metatiles/attributes`);

  const paths = [metatilesMatch[1]!, attributesMatch[1]!].sort(compare);
  return paths;
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

/** Picks a local id that appears in a border bin of a consuming layout. */
function chooseGbaBorderId(
  o: OracleGba,
  proj: Project,
  symbol: string,
): { localIndex: number; layout: OracleGbaLayout; map: string; borderCount: number } | undefined {
  for (const layout of o.layouts) {
    const role = layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
    if (role === undefined) continue;
    const names = o.maps
      .filter((map) => map.layout === layout.id)
      .map((map) => map.name)
      .sort(compare);
    if (names.length === 0) continue;

    const loaded = proj.layoutById(layout.id);
    if (!loaded) continue;
    const split = proj.splitFor(loaded);
    const base = role === "primary" ? 0 : split.metatiles;
    const limit = role === "primary" ? split.metatiles : Number.POSITIVE_INFINITY;

    const gridCells = o.cells(layout.blockdataFilepath);
    const borderCells = o.cells(layout.borderFilepath);

    const gridCounts = new Map<number, number>();
    for (const cell of gridCells) gridCounts.set(cell, (gridCounts.get(cell) ?? 0) + 1);
    const borderCounts = new Map<number, number>();
    for (const cell of borderCells) borderCounts.set(cell, (borderCounts.get(cell) ?? 0) + 1);

    for (const [cell, count] of gridCounts) {
      if (cell >= base && cell < limit && count < gridCells.length) {
        const borderCount = borderCounts.get(cell) ?? 0;
        if (borderCount > 0) {
          return { localIndex: cell - base, layout, map: names[0]!, borderCount };
        }
      }
    }
  }
  return undefined;
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
    expect(usage.sharedGrids).toEqual(expected.sharedGrids); // R9: assert sharedGrids

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

    // R2a: both aliases have border $00 in attributes.asm, so block 0 has two
    // border references on the one PortPassage entry (summed per map, not per file).
    expect(olivine.border).toBe(0);
    expect(vermilion.border).toBe(0);
    const zero: Usage = gbcBlockUsage(proj, ts.metatilesPath, 0, new Map());
    const zeroEntry = zero.maps.find((entry: UsageMap) => entry.map === "OlivinePortPassage");
    expect(zeroEntry).toEqual(gbcUsageOracle(o, ts.metatilesPath, 0, new Map()).maps.find((e) => e.map === "OlivinePortPassage"));
    expect(zeroEntry!.border).toBe(2);
    expect(zeroEntry!.block0AsBorder).toBe(0);
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
    expect(borderUsage.sharedGrids).toEqual(borderExpected.sharedGrids);
    const borderEntry = borderUsage.maps.find((entry: UsageMap) => entry.map === map.name);
    expect(borderEntry, `an entry for ${map.name}`).toBeDefined();
    expect(borderEntry!.interior).toBe(0);
    expect(borderEntry!.border).toBe(1);
    expect(borderEntry!.block0AsBorder).toBe(area);

    const zeroUsage: Usage = gbcBlockUsage(proj, ts.metatilesPath, 0, staged);
    const zeroExpected = gbcUsageOracle(o, ts.metatilesPath, 0, staged);
    expect(zeroUsage.maps).toEqual(zeroExpected.maps);
    expect(zeroUsage.sharedGrids).toEqual(zeroExpected.sharedGrids);
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
    expect(usage.sharedGrids).toEqual(expected.sharedGrids); // R9: assert sharedGrids
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
    expect(usage.sharedGrids).toEqual(gbcUsageOracle(o, ts.metatilesPath, id, staged).sharedGrids);
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
    expect(aliasUsage.sharedGrids).toEqual(gbcUsageOracle(o, secondTs.metatilesPath, secondId, aliasStaged).sharedGrids);
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
    expect(u1.sharedGrids).toEqual(gbcUsageOracle(o, ts.metatilesPath, rare.id, gridsA).sharedGrids);
    expect(u2.maps).toEqual(gbcUsageOracle(o, ts.metatilesPath, rare.id, gridsB).maps);
    expect(u2.sharedGrids).toEqual(gbcUsageOracle(o, ts.metatilesPath, rare.id, gridsB).sharedGrids);

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
    expect(u3.sharedGrids).toEqual(disk.sharedGrids);
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

  itWithGbcCorpus("unknown metatiles path returns empty usage (R6a)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const usage = gbcBlockUsage(proj, "nope/missing.bin", 1, new Map());
    expect(usage).toEqual({ files: [], tilesets: [], maps: [], sharedGrids: [] });
    // R6a: a backslash spelling of a real file answers with canonical paths.
    const cave = gbcOracle().tilesets.get("TILESET_CAVE")!.metatilesPath;
    const spelled = gbcBlockUsage(proj, cave.replace(/\//g, "\\"), 1, new Map());
    expect(spelled.files).toEqual(gbcBlockUsage(proj, cave, 1, new Map()).files);
    expect(spelled.files.every((f) => !f.includes("\\"))).toBe(true);
  });

  // R11b: Border hit test - GBC gbcTileUsage: map's BORDER block contains the tile;
  // stage that map's grid to a non-containing id; the map must still be in `maps`.
  itWithGbcCorpus("gbcTileUsage keeps a map whose border block contains the tile even when staged grid does not", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);

    // Find a map where the border block contains a specific tile, and that tile
    // appears in some block in the metatiles file.
    const byPalMap = new Map<string, OracleGbcTileset[]>();
    for (const ts of o.tilesets.values()) {
      const list = byPalMap.get(ts.palMapPath) ?? [];
      list.push(ts);
      byPalMap.set(ts.palMapPath, list);
    }

    let fixture: { palMapPath: string; tileId: number; map: OracleGbcMap; nonContainingId: number } | undefined;
    for (const [palMapPath, tilesets] of byPalMap) {
      const maps = o.maps.filter((map) => tilesets.some((ts) => ts.constName === map.tileset));
      for (const map of maps) {
        const ts = o.tilesets.get(map.tileset)!;
        if ((map.border + 1) * 16 > readFileSync(join(o.root, ts.metatilesPath)).length) continue;
        // Find a tile that's in the border block
        const borderBlockBytes = readFileSync(join(o.root, ts.metatilesPath)).subarray(map.border * 16, map.border * 16 + 16);
        for (const tileId of borderBlockBytes) {
          // Find a block id that does NOT contain this tile and is not the border
          const allContaining = new Set(tileBlockIds(o.root, ts.metatilesPath, tileId));
          const nonContainingId = Array.from({ length: 256 }, (_, i) => i)
            .find((id) => !allContaining.has(id) && id !== map.border);
          if (nonContainingId !== undefined) {
            fixture = { palMapPath, tileId, map, nonContainingId };
            break;
          }
        }
        if (fixture) break;
      }
      if (fixture) break;
    }

    expect(fixture, "a map whose border block contains a tile, with a non-containing block id").toBeDefined();
    if (!fixture) return;

    const area = fixture.map.width * fixture.map.height;
    const staged = new Map<string, number[]>([
      [fixture.map.name, Array.from({ length: area }, () => fixture.nonContainingId)],
    ]);

    const usage = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, staged);
    // The map should still be in maps because its border block contains the tile
    expect(usage.maps).toContain(fixture.map.name);
  });

  // R12: Overlay test - no disk write
  itWithGbcCorpus("gbcTileUsage honours tileset overlay (proj.setTilesetOverlay)", () => {
    const o = gbcOracle();
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const fixture = chooseGbcTileFixture(o);

    // Get the metatiles file path for this map's tileset
    const ts = o.tilesets.get(fixture.map.tileset)!;
    const metatilesPath = ts.metatilesPath;

    // Get the block ids containing the tile before overlay
    const before = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, new Map());
    const beforeBlocks = before.blocks.find(b => b.metatilesPath === metatilesPath);
    expect(beforeBlocks).toBeDefined();
    const beforeIds = [...beforeBlocks!.ids].sort((a, b) => a - b);

    // Read the metatiles file and modify one block that did NOT contain the tile
    // to have its first byte = tileId
    const originalBytes = readFileSync(join(GBC_SUBJECT_ROOT, metatilesPath));
    const modifiedBytes = Buffer.from(originalBytes);
    let modified = false;
    for (let offset = 0; offset + 16 <= modifiedBytes.length; offset += 16) {
      const blockId = offset / 16;
      if (!beforeBlocks!.ids.includes(blockId)) {
        modifiedBytes[offset] = fixture.tileId;
        modified = true;
        break;
      }
    }
    expect(modified, "a block that does not contain the tile").toBe(true);

    // Apply overlay
    const generationBefore = proj.tilesetGeneration;
    const overlay = new Map([[metatilesPath, modifiedBytes]]);
    proj.setTilesetOverlay(overlay);

    // Check that tilesetGeneration increased
    expect(proj.tilesetGeneration).toBeGreaterThan(generationBefore);

    // Check that the new block id now appears in blocks
    const after = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, new Map());
    const afterBlocks = after.blocks.find(b => b.metatilesPath === metatilesPath);
    expect(afterBlocks).toBeDefined();
    const afterIds = [...afterBlocks!.ids].sort((a, b) => a - b);
    const newId = afterIds.find(id => !beforeIds.includes(id));
    expect(newId).toBeDefined();

    // Clear overlay
    proj.setTilesetOverlay(new Map());

    // Check that the new id is gone
    const cleared = gbcTileUsage(proj, fixture.palMapPath, fixture.tileId, new Map());
    const clearedBlocks = cleared.blocks.find(b => b.metatilesPath === metatilesPath);
    expect(clearedBlocks).toBeDefined();
    const clearedIds = [...clearedBlocks!.ids].sort((a, b) => a - b);
    expect(clearedIds).toEqual(beforeIds);
  });
});

describe("GBA block usage", () => {
  itWithCorpus("gbaConsumingLayouts lists both roles (R8a: primary==secondary yields two), and gbaBlockUsage counts every consuming layout", () => {
    const o = gbaOracle();
    const proj = openProject(SUBJECT_ROOT);
    const symbol = "gTileset_General";

    const consuming: GbaLayoutUse[] = gbaConsumingLayouts(proj, symbol);
    // R8a: oracle must match - layout with primary==secondary yields TWO entries (primary then secondary)
    // pairedWith from project's loaded layout (source of truth)
    const expected = o.layouts
      .flatMap((layout) => {
        const entries: { layout: OracleGbaLayout; role: "primary" | "secondary" }[] = [];
        if (layout.primaryTileset === symbol) {
          entries.push({ layout, role: "primary" });
        }
        if (layout.secondaryTileset === symbol) {
          entries.push({ layout, role: "secondary" });
        }
        return entries;
      })
      .sort((a, b) => compare(a.layout.id, b.layout.id));

    expect(consuming.map((e) => e.layout)).toEqual(expected.map((e) => e.layout.id));
    for (const [i, entry] of consuming.entries()) {
      const want = expected[i]!;
      expect(entry.role).toBe(want.role);
      const loaded = proj.layoutById(want.layout.id);
      expect(loaded, `layout ${want.layout.id}`).toBeDefined();
      expect(entry.split).toEqual(proj.splitFor(loaded!));
      const expectedPaired = want.role === "primary" ? want.layout.secondaryTileset : want.layout.primaryTileset;
      expect(entry.pairedWith).toBe(expectedPaired);
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
    expect(usage.sharedGrids).toEqual(expectedUsage.sharedGrids); // R9a: assert sharedGrids
    // R9: the two per-symbol binaries, from the headers.h / metatiles.h oracle.
    expect(expectedUsage.files).toHaveLength(2);
    expect(usage.files).toEqual(expectedUsage.files);
    for (const f of usage.files) expect(existsSync(join(SUBJECT_ROOT, f)), f).toBe(true);

    // Staging every cell of the picked layout's grid to the target id raises
    // that grid's interior count without relying on any cached count.
    const stagedSplit = proj.splitFor(proj.layoutById(pick.layout.id)!);
    const target = pick.layout.primaryTileset === symbol ? localIndex : stagedSplit.metatiles + localIndex;
    const area = o.cells(pick.layout.blockdataFilepath).length;
    const grids = new Map<string, number[]>([[pick.map, Array.from({ length: area }, () => target)]]);

    const stagedUsage: Usage = gbaBlockUsage(proj, symbol, localIndex, grids);
    expect(stagedUsage.maps).toEqual(gbaUsageOracle(proj, o, symbol, localIndex, grids).maps);
    expect(stagedUsage.sharedGrids).toEqual(gbaUsageOracle(proj, o, symbol, localIndex, grids).sharedGrids);
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
    // R8a: oracle must match - all layouts where this symbol is primary or secondary (no map filtering)
    const expected = o.layouts
      .flatMap((layout) => {
        const entries: { layout: OracleGbaLayout; role: "primary" | "secondary" }[] = [];
        if (layout.primaryTileset === secondary) {
          entries.push({ layout, role: "primary" });
        }
        if (layout.secondaryTileset === secondary) {
          entries.push({ layout, role: "secondary" });
        }
        return entries;
      })
      .sort((a, b) => compare(a.layout.id, b.layout.id));

    expect(consuming.map((e) => e.layout)).toEqual(expected.map((e) => e.layout.id));
    for (const [i, entry] of consuming.entries()) {
      const want = expected[i]!;
      expect(entry.role).toBe(want.role);
      const loaded = proj.layoutById(want.layout.id);
      expect(loaded, `layout ${want.layout.id}`).toBeDefined();
      const expectedPaired = want.role === "primary" ? want.layout.secondaryTileset : want.layout.primaryTileset;
      expect(entry.pairedWith).toBe(expectedPaired);
      expect(entry.split).toEqual(proj.splitFor(loaded!));
    }

    const expectedUsage = gbaUsageOracle(proj, o, secondary, localIndex, new Map());
    const usage: Usage = gbaBlockUsage(proj, secondary, localIndex, new Map());
    expect(usage.tilesets).toEqual([secondary]);
    expect(expectedUsage.maps.length, "a scanned id that a consuming grid actually draws").toBeGreaterThan(0);
    expect(usage.files).toEqual(expectedUsage.files);
    expect(usage.sharedGrids).toEqual(expectedUsage.sharedGrids); // R9a: assert sharedGrids
    expect(usage.maps).toEqual(expectedUsage.maps);
  });

  // R9b: unknown symbol returns empty usage
  itWithCorpus("unknown GBA symbol returns empty usage (R9b)", () => {
    const proj = openProject(SUBJECT_ROOT);
    const usage = gbaBlockUsage(proj, "gTileset_Nope", 0, new Map());
    expect(usage).toEqual({ files: [], tilesets: [], maps: [], sharedGrids: [] });
  });

  // R10a: Border hit test - GBA: pick a gTileset_General local id that appears in some
  // consuming layout's border bin, assert border > 0 and maps equal oracle
  itWithCorpus("gbaBlockUsage counts border hits for a local id appearing in a border bin", () => {
    const o = gbaOracle();
    const proj = openProject(SUBJECT_ROOT);
    const symbol = "gTileset_General";

    const borderFixture = chooseGbaBorderId(o, proj, symbol);
    expect(borderFixture, "a gTileset_General id drawn in a consuming layout's border bin").toBeDefined();
    if (!borderFixture) return;

    const localIndex = borderFixture.localIndex;
    const usage: Usage = gbaBlockUsage(proj, symbol, localIndex, new Map());
    const expectedUsage = gbaUsageOracle(proj, o, symbol, localIndex, new Map());

    // Find the entry for this layout's file
    const entry = usage.maps.find(e => e.map === borderFixture.map);
    expect(entry, `entry for ${borderFixture.map}`).toBeDefined();
    expect(entry!.border).toBeGreaterThan(0);
    expect(entry!.border).toBe(expectedUsage.maps.find(e => e.map === borderFixture.map)!.border);
    expect(usage.maps).toEqual(expectedUsage.maps);
    expect(usage.sharedGrids).toEqual(expectedUsage.sharedGrids);
  });

  // Ensure at least one GBA test has non-empty sharedGrids
  itWithCorpus("at least one GBA tileset has non-empty sharedGrids (multi-map layout)", () => {
    const o = gbaOracle();
    const proj = openProject(SUBJECT_ROOT);
    const symbol = "gTileset_General";

    // Find a local id that gives us sharedGrids (2+ maps on same blockdata file)
    let foundShared = false;
    let workingLocalIndex: number | undefined;

    for (const layout of o.layouts) {
      const role = layout.primaryTileset === symbol ? "primary" : layout.secondaryTileset === symbol ? "secondary" : undefined;
      if (role === undefined) continue;
      
      const names = o.maps.filter(m => m.layout === layout.id).map(m => m.name).sort(compare);
      if (names.length === 0) continue;

      const loaded = proj.layoutById(layout.id);
      if (!loaded) continue;
      const split = proj.splitFor(loaded);
      const base = role === "primary" ? 0 : split.metatiles;
      const limit = role === "primary" ? split.metatiles : Number.POSITIVE_INFINITY;

      const cells = o.cells(layout.blockdataFilepath);
      const counts = new Map<number, number>();
      for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);

      for (const [cell, count] of counts) {
        if (cell >= base && cell < limit && count < cells.length) {
          const localIndex = cell - base;
          // Fixture chosen by the oracle, never by the function under test.
          if (gbaUsageOracle(proj, o, symbol, localIndex, new Map()).sharedGrids.length > 0) {
            foundShared = true;
            workingLocalIndex = localIndex;
            break;
          }
        }
      }
      if (foundShared) break;
    }

    expect(foundShared, "gTileset_General should have a local id producing sharedGrids").toBe(true);
    expect(workingLocalIndex).toBeDefined();

    const usage: Usage = gbaBlockUsage(proj, symbol, workingLocalIndex!, new Map());
    const expectedShared = gbaUsageOracle(proj, o, symbol, workingLocalIndex!, new Map());
    expect(usage.sharedGrids.length).toBeGreaterThan(0);
    expect(usage.sharedGrids).toEqual(expectedShared.sharedGrids);
    expect(usage.maps).toEqual(expectedShared.maps);
  });
});

describe("GBA multi-target grid files (synthetic layouts, no corpus shape has them)", () => {
  // No corpus has a layout with primary == secondary or two layouts on one
  // blockdata file, so this stubs the layout table over the real project.
  // Expected counts come from the staged grid and the raw border bin, by hand.
  itWithCorpus("R8a/R9a: every distinct target on a shared file is counted, and every map is named", () => {
    const o = gbaOracle();
    const real = openProject(SUBJECT_ROOT);
    const symbol = "gTileset_General";
    const base = o.layouts.find((l) => l.primaryTileset === symbol && o.maps.some((m) => m.layout === l.id))!;
    expect(base, "a gTileset_General primary layout with a map").toBeDefined();
    const baseLayout = real.layoutById(base.id)!;
    const realMap = o.maps.find((m) => m.layout === base.id)!.name;
    const s = real.splitFor(baseLayout).metatiles;
    const k = 3;

    const same = { ...baseLayout, id: "LAYOUT_T5_SAME", primaryTileset: symbol, secondaryTileset: symbol };
    const other = { ...baseLayout, id: "LAYOUT_T5_OTHER", primaryTileset: "gTileset_T5Stub", secondaryTileset: symbol };
    const mapLayout: Record<string, string> = { MapT5A: same.id, MapT5B: other.id };
    const fake = Object.create(real) as Project;
    Object.defineProperty(fake, "layouts", { value: [same, other] });
    Object.defineProperty(fake, "mapNames", { value: () => Object.keys(mapLayout) });
    Object.defineProperty(fake, "map", { value: (n: string) => ({ ...real.map(realMap), layout: mapLayout[n]! }) });

    // R8a: the same-symbol layout gives a primary and a secondary use.
    const uses = gbaConsumingLayouts(fake, symbol).map((u) => `${u.layout}:${u.role}`);
    expect(uses).toEqual(["LAYOUT_T5_OTHER:secondary", "LAYOUT_T5_SAME:primary", "LAYOUT_T5_SAME:secondary"]);

    // Targets k (primary) and s + k (both secondary uses) on one file.
    const grid = [k, s + k, s + k, k + 1];
    const usage = gbaBlockUsage(fake, symbol, k, new Map([["MapT5B", grid]]));
    const borderCells = o.cells(base.borderFilepath);
    const borderHits = borderCells.filter((c) => c === k || c === s + k).length;
    expect(usage.maps).toEqual([{ map: "MapT5A", interior: 3, border: borderHits, block0AsBorder: 0 }]);
    expect(usage.sharedGrids).toEqual([{ file: base.blockdataFilepath, maps: ["MapT5A", "MapT5B"] }]);
  });
});

describe("E1 file-keyed consumers", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  function fixture(): Project {
    const root = makeGbaFixture(false, true); roots.push(root); return openProject(root);
  }
  interface Use {
    layout: Layout;
    role: "primary" | "secondary";
    tileset: string;
    pairedWith: string;
  }
  // E1a is a direct OR against the edited symbol's two canonical paths.
  function consumers(p: Project, symbol: string): Use[] {
    if (!p.tilesetSymbols().includes(symbol)) return [];
    const paths = p.tilesetPaths(symbol);
    const aliases = new Set(p.tilesetSymbols().filter(name => {
      const other = p.tilesetPaths(name);
      return other.metatilesBin === paths.metatilesBin || other.attributesBin === paths.attributesBin;
    }));
    const uses: Use[] = [];
    for (const layout of p.layouts) {
      if (aliases.has(layout.primaryTileset)) uses.push({ layout, role: "primary", tileset: layout.primaryTileset, pairedWith: layout.secondaryTileset });
      if (aliases.has(layout.secondaryTileset)) uses.push({ layout, role: "secondary", tileset: layout.secondaryTileset, pairedWith: layout.primaryTileset });
    }
    return uses.sort((a, b) => compare(a.layout.id, b.layout.id) || (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1));
  }
  function disk(p: Project, file: string): number[] {
    const raw = readFileSync(join(p.paths.root, file));
    return Array.from({ length: raw.length / 2 }, (_, i) => raw.readUInt16LE(i * 2) & 0x3ff);
  }
  function target(p: Project, use: Use, local: number): number {
    return use.role === "primary" ? local : p.splitFor(use.layout).metatiles + local;
  }
  function names(p: Project, layout: Layout): string[] {
    return p.mapNames().filter(name => p.map(name).layout === layout.id).sort(compare);
  }
  // Independent R9a oracle: distinct interior targets and border-file/target pairs.
  function usage(p: Project, symbol: string, local: number): Usage {
    const uses = consumers(p, symbol), byFile = new Map<string, Use[]>();
    for (const use of uses) {
      if (names(p, use.layout).length === 0) continue;
      const file = use.layout.blockdataFilepath, group = byFile.get(file) ?? [];
      group.push(use); byFile.set(file, group);
    }
    const maps: UsageMap[] = [], sharedGrids: Usage["sharedGrids"] = [];
    for (const [file, group] of byFile) {
      const targets = new Set(group.map(use => target(p, use, local)));
      const interior = disk(p, file).filter(cell => targets.has(cell)).length;
      const pairs = new Map<string, Set<number>>();
      for (const use of group) {
        const border = use.layout.borderFilepath, ids = pairs.get(border) ?? new Set<number>();
        ids.add(target(p, use, local)); pairs.set(border, ids);
      }
      let border = 0;
      for (const [path, ids] of pairs) border += disk(p, path).filter(cell => ids.has(cell)).length;
      if (interior + border === 0) continue;
      const consumingNames = [...new Set(group.flatMap(use => names(p, use.layout)))].sort(compare);
      maps.push({ map: consumingNames[0]!, interior, border, block0AsBorder: 0 });
      const allNames = p.mapNames().filter(name => p.layoutForMap(name).blockdataFilepath === file).sort(compare);
      if (allNames.length >= 2) sharedGrids.push({ file, maps: allNames });
    }
    const paths = p.tilesetPaths(symbol);
    return {
      files: [...new Set([paths.metatilesBin, paths.attributesBin])].sort(compare),
      tilesets: [...new Set([symbol, ...uses.map(use => use.tileset)])].sort(compare),
      maps: maps.sort((a, b) => compare(a.map, b.map)),
      sharedGrids: sharedGrids.sort((a, b) => compare(a.file, b.file)),
    };
  }

  it.each(["gTileset_A", "gTileset_A2"])("E1.1: %s exposes every alias consumer and each role's own tileset", symbol => {
    const p = fixture();
    const expected = consumers(p, "gTileset_A").map(use => ({ layout: use.layout.id, role: use.role, tileset: use.tileset, pairedWith: use.pairedWith, split: p.splitFor(use.layout) }));
    expect(expected.map(use => use.layout)).toEqual(["E", "F", "H", "J", "K", "M", "M", "X"]);
    // Red today: symbol-keyed relations omit J/K and do not expose the role's tileset.
    expect(gbaConsumingLayouts(p, symbol)).toEqual(expected);
  });

  it("E1a: aliases are direct, not the transitive closure of shared files", () => {
    const p = fixture();
    const a = p.tilesetPaths("gTileset_A"), a3 = p.tilesetPaths("gTileset_A3"), a4 = p.tilesetPaths("gTileset_A4");
    expect(a4.metatilesBin).toBe(a3.metatilesBin);
    expect(a4.metatilesBin).not.toBe(a.metatilesBin);
    expect(a4.attributesBin).not.toBe(a.attributesBin);
    for (const symbol of ["gTileset_A", "gTileset_A3"]) {
      const expected = consumers(p, symbol).map(use => ({ layout: use.layout.id, role: use.role, tileset: use.tileset, pairedWith: use.pairedWith, split: p.splitFor(use.layout) }));
      expect(gbaConsumingLayouts(p, symbol)).toEqual(expected);
      expect(expected.some(use => use.layout === "L")).toBe(symbol === "gTileset_A3");
    }
  });

  it("E1b: distinct aliases in both layout slots count both disk targets", () => {
    const p = fixture(), local = 0, layout = p.layoutById("M")!;
    expect(p.splitFor(layout).metatiles).toBe(8);
    const expectedUses = consumers(p, "gTileset_A").filter(use => use.layout.id === "M");
    expect(expectedUses.map(use => [use.role, use.tileset, use.pairedWith])).toEqual([
      ["primary", "gTileset_A", "gTileset_A2"], ["secondary", "gTileset_A2", "gTileset_A"],
    ]);
    expect(gbaConsumingLayouts(p, "gTileset_A").filter(use => use.layout === "M").map(use => [use.role, use.tileset, use.pairedWith])).toEqual(
      expectedUses.map(use => [use.role, use.tileset, use.pairedWith]),
    );
    const cells = disk(p, layout.blockdataFilepath);
    expect(cells).toContain(local); expect(cells).toContain(8 + local);
    const interior = cells.filter(cell => cell === local || cell === 8 + local).length;
    expect(gbaBlockUsage(p, "gTileset_A", local, new Map()).maps).toContainEqual({ map: "AliasBoth", interior, border: 4, block0AsBorder: 0 });
  });

  it("E1.2: an A edit sees the local id drawn only by the A2 map", () => {
    const p = fixture(), local = 3, expected = usage(p, "gTileset_A", local);
    expect(expected.maps.map(entry => entry.map)).toEqual(["AliasTwo"]);
    expect(expected.maps[0]!.interior).toBe(disk(p, p.layoutForMap("AliasTwo").blockdataFilepath).filter(id => id === local).length);
    expect(expected.maps[0]!.interior).toBeGreaterThan(0);
    // Red today: A's symbol-only consumers cannot see AliasTwo's disk hits.
    expect.soft(gbaBlockUsage(p, "gTileset_A", local, new Map())).toEqual(expected);
    expect(gbaBlockUsage(p, "gTileset_A", local, new Map()).tilesets).toEqual(["gTileset_A", "gTileset_A2", "gTileset_A3"]);
  });

  it("E1.7: sharing only attributes is enough to consume an A edit", () => {
    const p = fixture(), local = 2, a = p.tilesetPaths("gTileset_A"), a3 = p.tilesetPaths("gTileset_A3");
    expect(a3.metatilesBin).not.toBe(a.metatilesBin); expect(a3.attributesBin).toBe(a.attributesBin);
    const expected = usage(p, "gTileset_A", local);
    expect(expected.maps.map(entry => entry.map)).toEqual(["AliasThree"]);
    // Red today: the attributes-only alias K is absent from A's symbol index.
    expect.soft(gbaConsumingLayouts(p, "gTileset_A").map(use => `${use.layout}:${use.role}`)).toContain("K:primary");
    expect(gbaBlockUsage(p, "gTileset_A", local, new Map())).toEqual(expected);
  });

  itWithCorpus("E1.8: real aliases contribute disk usage and confirmation across headers", () => {
    const p = openProject(SUBJECT_ROOT), groups = new Map<string, string[]>();
    for (const symbol of p.tilesetSymbols()) {
      const path = p.tilesetPaths(symbol).metatilesBin, group = groups.get(path) ?? [];
      group.push(symbol); groups.set(path, group);
    }
    const diskCache = new Map<string, readonly number[]>();
    const cells = (path: string): readonly number[] => {
      const cached = diskCache.get(path); if (cached) return cached;
      const ids = disk(p, path); diskCache.set(path, ids); return ids;
    };
    interface Pick { symbol: string; local: number; source: Use; map: string; other: Use }
    let exclusive: Pick | undefined;
    // Plan Task E1.8: the smoke case is the gTileset_Building* alias group; no other group may satisfy it.
    const candidates = [...groups.values()]
      .filter(group => group.length >= 2 && group.some(name => name.startsWith("gTileset_Building")))
      .sort((a, b) => compare(a[0]!, b[0]!));
    const searched: string[] = [];
    for (const group of candidates) {
      searched.push(group.join(", "));
      for (const symbol of group.sort(compare)) {
        const own = consumers(p, symbol).filter(use => use.tileset === symbol && names(p, use.layout).length > 0);
        const others = consumers(p, symbol).filter(use => use.tileset !== symbol && group.includes(use.tileset) && names(p, use.layout).length > 0);
        const count = readFileSync(join(SUBJECT_ROOT, p.tilesetPaths(symbol).metatilesBin)).length / 16;
        for (const other of others) {
          for (const drawn of new Set(cells(other.layout.blockdataFilepath))) {
            const local = drawn - (other.role === "primary" ? 0 : p.splitFor(other.layout).metatiles);
            if (local < 0 || local >= count || (other.role === "primary" && local >= p.splitFor(other.layout).metatiles)) continue;
            const source = own.find(use => use.role === "secondary" || local < p.splitFor(use.layout).metatiles);
            if (!source) continue;
            const pick: Pick = { symbol, local, source, map: names(p, source.layout)[0]!, other };
            const ownDraws = own.some(use => cells(use.layout.blockdataFilepath).includes(target(p, use, local)) || cells(use.layout.borderFilepath).includes(target(p, use, local)));
            if (!ownDraws) { exclusive = pick; break; }
          }
          if (exclusive) break;
        }
        if (exclusive) break;
      }
      if (exclusive) break;
    }
    const pick = exclusive;
    expect(pick, `no exclusive alias usage; searched groups: ${searched.join("; ")}`).toBeDefined();
    if (!pick) throw new Error(`E1 oracle found no exclusive alias usage; searched groups: ${searched.join("; ")}`);
    const expected = usage(p, pick.symbol, pick.local);
    const otherFile = pick.other.layout.blockdataFilepath;
    const representative = consumers(p, pick.symbol).filter(use => use.layout.blockdataFilepath === otherFile).flatMap(use => names(p, use.layout)).sort(compare)[0]!;
    const expectedEntry = expected.maps.find(entry => entry.map === representative);
    expect(expectedEntry, `disk usage entry for ${otherFile}`).toBeDefined();
    if (!expectedEntry) throw new Error(`E1 oracle found no usage entry for ${otherFile}`);
    expect(expectedEntry.interior).toBeGreaterThan(0);
    // Red today: real headers sharing a binary are excluded from the edited symbol's usage/confirmation.
    expect.soft(gbaBlockUsage(p, pick.symbol, pick.local, new Map()).maps).toContainEqual(expectedEntry);
    const tileset = p.tileset(pick.symbol);
    const changed: GbaBlockDraft = { entries: tileset.metatile(pick.local), behavior: tileset.behavior(pick.local) ^ 1, layerType: tileset.layerType(pick.local) };
    const result = planGbaBlockEdit(p, { map: pick.map, metatileId: target(p, pick.source, pick.local), mode: "ok", from: "palette", draft: changed }, new Map(), new Map());
    expect(result.edits.length).toBeGreaterThan(0);
    expect(result.confirm).toBe(true);
  });
});
