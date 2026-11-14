import type { GbcProject } from "../gbc/project.js";
import type { GbcMap, GbcTileset } from "../gbc/model/types.js";
import type { BlockEditPlan, FileOverlay, GridIds, StagedGrids } from "./types.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanCalls } from "../gbc/load/asm.js";
import { readShadesPng } from "../gbc/load/png.js";
import { parseMetatiles, parsePaletteMap, pngTileIndex, sliceTiles } from "../gbc/load/tileset.js";
import { canonicalTilesetPath as canon } from "./canonicalTilesetPath.js";
import { patchGbcCollision, patchGbcMetatiles, patchGbcPaletteMap } from "./gbcPatch.js";
import { copySheetTile, loadGbcReservedTiles } from "./gbcSheet.js";
import { BlockEditRefusal } from "./types.js";
import { gbcBlockUsage, gbcTileUsage, gbcTilesetsForFile } from "./usage.js";

const paletteNames = new Set(["GRAY", "RED", "GREEN", "WATER", "YELLOW", "BROWN", "ROOF", "TEXT"]);
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const bad = (message: string): never => { throw new BlockEditRefusal("BAD_VALUE", message); };

function effectiveGrid(proj: GbcProject, map: GbcMap, grids: StagedGrids): GridIds {
  const winner = proj.maps.filter(m => m.blkPath === map.blkPath && grids.has(m.name))
    .map(m => m.name).sort(compare)[0];
  return winner !== undefined ? grids.get(winner)! : proj.layout(map).layout.blocks.map(b => b.metatileId);
}

function checkCell(map: GbcMap, cell: { x: number; y: number } | undefined): void {
  if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
      cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) {
    bad(`${map.name}: cell is outside the map`);
  }
}

// Keep names as well as banks, without depending on a project's parsed overlay.
function effectivePalette(text: string, path: string) {
  const constants = new Map<string, number>();
  const names: string[] = [];
  for (const call of scanCalls(text, "tilepal")) for (const arg of call.args.slice(1)) {
    if (!constants.has(`PAL_BG_${arg.text}`)) {
      constants.set(`PAL_BG_${arg.text}`, names.length);
      names.push(arg.text);
    }
  }
  const palMap = parsePaletteMap(text, constants, path);
  return { palMap, names: palMap.map(entry => entry === null ? null : names[entry.pal]!) };
}

export function gbcSheetToTileId(ts: GbcTileset): (sheetIndex: number) => number | null {
  const inverse = new Map<number, number>();
  for (let tile = 0; tile < ts.palMap.length; tile++) {
    const index = pngTileIndex(ts, tile);
    if (index !== null && !inverse.has(index)) inverse.set(index, tile);
  }
  return index => inverse.get(index) ?? null;
}
export interface GbcBlockDraft {
  tiles: number[];
  collision: [string, string, string, string];
  palettes: { square: number; palName: string; scope: "all" | "local" }[];
}
export interface GbcBlockEditRequest {
  map: string;
  blockId: number;
  mode: "ok" | "saveAsNew";
  from: "map" | "palette";
  cell?: { x: number; y: number };
  draft: GbcBlockDraft;
}
export function resolveGbcEditTarget(proj: GbcProject, map: string, cell: { x: number; y: number }, grids: StagedGrids): { blockId: number; viaBorder: boolean } {
  const target = proj.map(map);
  checkCell(target, cell);
  const raw = effectiveGrid(proj, target, grids)[cell.y * target.width + cell.x];
  if (raw === undefined) bad(`${map}: cell has no block`);
  return raw === 0 ? { blockId: target.border, viaBorder: true } : { blockId: raw!, viaBorder: false };
}
export function blockEditRevision(files: ReadonlyMap<string, Buffer>, grid: GridIds): string {
  const hash = createHash("sha1");
  for (const [path, bytes] of [...files].sort(([a], [b]) => compare(a, b))) {
    hash.update(path).update("\0").update(String(bytes.length)).update("\0").update(bytes);
  }
  hash.update("grid\0").update(String(grid.length)).update("\0").update(grid.join(","));
  return hash.digest("hex");
}
export function planGbcBlockEdit(proj: GbcProject, req: GbcBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan {
  const map = proj.map(req.map);
  const ts = proj.tileset(map.tileset);
  const metaPath = canon(ts.metatilesPath);
  const collPath = canon(ts.collisionPath);
  const palPath = canon(ts.palMapPath);
  const gfxPath = canon(ts.gfxPath);
  const before = new Map<string, Buffer>();
  const read = (path: string): Buffer => {
    const key = canon(path);
    let bytes = before.get(key);
    if (bytes === undefined) {
      bytes = staged.get(key) ?? readFileSync(join(proj.root, path));
      before.set(key, bytes);
    }
    return bytes;
  };
  const parse = <T>(path: string, fn: () => T): T => {
    try { return fn(); } catch (error) {
      if (error instanceof BlockEditRefusal) throw error;
      return bad(`${path}: ${(error as Error).message}`);
    }
  };
  const blocks = parse(metaPath, () => parseMetatiles(read(metaPath), metaPath));
  const source = blocks[req.blockId];
  if (!Number.isInteger(req.blockId) || !source) bad(`${metaPath}: invalid block id ${req.blockId}`);
  const d = req.draft;
  if (d.tiles.length !== 16 || d.tiles.some(t => !Number.isInteger(t)) || d.collision.length !== 4) {
    bad(`${metaPath}: expected 16 integer tiles and four collision names`);
  }
  for (const entry of d.palettes) {
    if (!Number.isInteger(entry.square) || entry.square < 0 || entry.square >= 16 ||
        !paletteNames.has(entry.palName) || (entry.scope !== "all" && entry.scope !== "local")) {
      bad(`${palPath}: invalid palette entry`);
    }
  }
  if (req.mode === "saveAsNew" && req.from === "map") checkCell(map, req.cell);
  const collisionText = read(collPath).toString("latin1");
  // Validate collision names before the mode-specific refusals.
  patchGbcCollision(collisionText, req.blockId, d.collision, collPath);
  let paletteText = read(palPath).toString("latin1");
  const initialPalette = parse(palPath, () => effectivePalette(paletteText, palPath));
  let png = read(gfxPath);
  let pixels = parse(gfxPath, () => sliceTiles(readShadesPng(png), gfxPath));
  const effectiveTs = { ...ts, palMap: initialPalette.palMap, tiles: pixels };
  for (let i = 0; i < 16; i++) {
    if (d.tiles[i] !== source!.tiles[i] && pngTileIndex(effectiveTs, d.tiles[i]!) === null) {
      bad(`${metaPath}: invalid tile ${d.tiles[i]} at square ${i}`);
    }
  }
  const entries = new Map<number, GbcBlockDraft["palettes"][number]>();
  for (const entry of d.palettes) {
    const tile = d.tiles[entry.square]!;
    const previous = entries.get(tile);
    if (previous && (previous.scope !== entry.scope || previous.palName !== entry.palName)) {
      bad(`${palPath}: conflicting palette entries for tile ${tile}`);
    }
    entries.set(tile, entry);
  }
  const changes = [...entries].filter(([tile, entry]) => initialPalette.names[tile] !== entry.palName);
  const all = changes.filter(([, entry]) => entry.scope === "all");
  if (req.mode === "saveAsNew" && all.length) {
    throw new BlockEditRefusal("ALL_WITH_SAVE_AS_NEW", `${metaPath}: All palette edits cannot be saved as new`);
  }
  const sharingMaps = proj.maps.filter(m => m.blkPath === map.blkPath).map(m => m.name).sort(compare);
  if (req.mode === "saveAsNew" && req.from === "map" && sharingMaps.length >= 2) {
    throw new BlockEditRefusal("SHARED_GRID", `${map.name}: shared grid used by ${sharingMaps.join(", ")}`);
  }
  if (req.mode === "saveAsNew" && blocks.length >= 256) {
    throw new BlockEditRefusal("BLOCK_CAP", `${metaPath}: block cap 256 reached`);
  }
  const tiles = [...d.tiles];
  const taken = new Set<number>();
  let reserved: Set<number> | undefined;
  let used: Set<number> | undefined;
  const sheetToTile = gbcSheetToTileId(effectiveTs);
  for (const [tile, entry] of changes) {
    if (initialPalette.names[tile] == null) bad(`${palPath}: tile ${tile} has no palette-map entry`);
    if (entry.scope === "all") {
      paletteText = patchGbcPaletteMap(paletteText, tile, entry.palName, palPath);
      continue;
    }
    const sharing = gbcTilesetsForFile(proj, metaPath).map(c => proj.tileset(c))
      .filter(t => canon(t.metatilesPath) === metaPath);
    if (sharing.some(t => canon(t.gfxPath) !== gfxPath || canon(t.palMapPath) !== palPath)) {
      throw new BlockEditRefusal("LOCAL_SHEET_MISMATCH", `${metaPath}: Local sheet mismatch: ${sharing.map(t => t.name).sort(compare).join(", ")}`);
    }
    reserved ??= loadGbcReservedTiles(proj.root);
    if (reserved.has(tile)) {
      throw new BlockEditRefusal("RESERVED_TILE", `tile $${tile.toString(16).padStart(2, "0")}: reserved by runtime`);
    }
    const sourceIndex = pngTileIndex(effectiveTs, tile);
    if (sourceIndex === null) bad(`${gfxPath}: tile ${tile} has no sheet pixels`);
    const currentPalette = parse(palPath, () => effectivePalette(paletteText, palPath));
    let target: number | undefined;
    for (let s = 0; s < pixels.length; s++) {
      const candidate = sheetToTile(s);
      if (candidate !== null && candidate !== tile && !reserved.has(candidate) &&
          currentPalette.names[candidate] === entry.palName &&
          Buffer.from(pixels[s]!).equals(Buffer.from(pixels[sourceIndex!]!))) {
        target = candidate;
        break;
      }
    }
    if (target === undefined) {
      if (!used) {
        used = new Set<number>();
        for (const c of gbcTilesetsForFile(proj, gfxPath)) {
          const other = proj.tileset(c);
          if (canon(other.gfxPath) !== gfxPath) continue;
          const otherBlocks = parse(other.metatilesPath, () => parseMetatiles(read(other.metatilesPath), other.metatilesPath));
          for (const block of otherBlocks) for (const id of block.tiles) used.add(id);
        }
      }
      let slot: number | undefined;
      for (let s = 0; s < pixels.length; s++) {
        const candidate = sheetToTile(s);
        if (candidate !== null && !reserved.has(candidate) && !used.has(candidate) &&
            !d.tiles.includes(candidate) && !taken.has(candidate)) {
          target = candidate;
          slot = s;
          break;
        }
      }
      if (slot === undefined || target === undefined) {
        throw new BlockEditRefusal("NO_FREE_TILE", `${gfxPath}: no free tile in sheet of ${pixels.length} tiles`);
      }
      png = copySheetTile(png, sourceIndex!, slot, gfxPath);
      paletteText = patchGbcPaletteMap(paletteText, target, entry.palName, palPath);
      pixels = parse(gfxPath, () => sliceTiles(readShadesPng(png), gfxPath));
    }
    taken.add(target);
    for (let i = 0; i < tiles.length; i++) if (d.tiles[i] === tile) tiles[i] = target;
  }
  const id = req.mode === "saveAsNew" ? blocks.length : req.blockId;
  const after = new Map<string, Buffer>([
    [metaPath, patchGbcMetatiles(read(metaPath), id, tiles, metaPath)],
    [collPath, Buffer.from(patchGbcCollision(collisionText, id, d.collision, collPath), "latin1")],
    [palPath, Buffer.from(paletteText, "latin1")],
    [gfxPath, png],
  ]);
  const edits = [...after].filter(([path, bytes]) => !read(path).equals(bytes))
    .map(([path, bytes]) => ({ path, before: read(path), after: bytes }))
    .sort((a, b) => compare(a.path, b.path));
  let confirm = false;
  if (edits.length && req.mode !== "saveAsNew") {
    confirm = proj.maps.some(other => other.name !== req.map &&
      canon(proj.tileset(other.tileset).metatilesPath) === metaPath &&
      (other.border === req.blockId || effectiveGrid(proj, other, grids).includes(req.blockId)));
    if (!confirm && all.length) {
      // Usage's static relations are reusable, but its block views must use R1 bytes.
      const cache = new Map<string, GbcTileset>();
      const view: GbcProject = { ...proj, tileset: c => {
        let result = cache.get(c);
        if (!result) {
          const original = proj.tileset(c);
          result = { ...original, metatiles: parse(original.metatilesPath,
            () => parseMetatiles(read(original.metatilesPath), original.metatilesPath)) };
          cache.set(c, result);
        }
        return result;
      } };
      confirm = all.some(([tile]) => gbcTileUsage(view, palPath, tile, grids).maps.some(name => name !== req.map));
    }
  }
  const files = new Map([metaPath, collPath, palPath, gfxPath].map(path => [path, read(path)]));
  return {
    edits, warnings: [], confirm,
    usage: gbcBlockUsage(proj, metaPath, req.blockId, grids),
    revision: blockEditRevision(files, effectiveGrid(proj, map, grids)),
    ...(req.mode === "saveAsNew" ? { newBlockId: id,
      ...(req.from === "map" ? { placement: { x: req.cell!.x, y: req.cell!.y, blockId: id } } : {}) } : {}),
  };
}
