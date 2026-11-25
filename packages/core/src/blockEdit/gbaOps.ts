/**
 * Plan 14.2 Task 7: the GBA block edit planner.
 *
 * Pure planning: every tileset file is read through the caller's staged overlay
 * (falling back to disk), the returned edits carry the effective bytes as
 * `before`, and no file is written. Entries, attribute words and metatile counts
 * always come from those bytes -- never from the project's own overlay, which
 * may be older than the planner's candidate state (R1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "../project.js";
import type { TileEntry } from "../load/tilesetData.js";
import type { Layout, Split } from "../model/types.js";
import { parseBlocks } from "../load/blocks.js";
import { canonicalTilesetPath } from "./canonicalTilesetPath.js";
import { assertNotTripleLayer, patchGbaAttribute, patchGbaMetatile } from "./gbaPatch.js";
import { blockEditRevision } from "./gbcOps.js";
import { gbaBlockUsage, gbaConsumingLayouts, gbaMapsByGridFile, gbaMapsByLayout } from "./usage.js";
import { assertLayoutUsable } from "../brokenComponents.js";
import { PathEscapeError } from "../gbc/load/pathGuard.js";
import { BlockEditRefusal, type BlockEditPlan, type FileOverlay, type GridIds, type StagedGrids } from "./types.js";
import { errorMessage } from "../errorMessage.js";

export interface GbaBlockDraft { entries: TileEntry[]; behavior: number; layerType: number }
export interface GbaBlockEditRequest {
  map: string; metatileId: number; mode: "ok" | "saveAsNew";
  from: "map" | "palette"; cell?: { x: number; y: number }; draft: GbaBlockDraft;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const bad = (message: string): never => { throw new BlockEditRefusal("BAD_VALUE", message); };
const METATILE_BYTES = 16;
const NUM_PALS_TOTAL = 13;

/** One layout that consumes a tileset symbol, with both halves named. */
interface ConsumingUse {
  layout: string;
  layoutObject: Layout;
  role: "primary" | "secondary";
  split: Split;
  primary: string;
  secondary: string;
}

function consumingUses(proj: Project, symbol: string): ConsumingUse[] {
  const layoutById = new Map(proj.layouts.map((layout) => [layout.id, layout]));
  return gbaConsumingLayouts(proj, symbol)
    .map((use) => ({
      layout: use.layout,
      layoutObject: layoutById.get(use.layout)!,
      role: use.role,
      split: use.split,
      primary: layoutById.get(use.layout)!.primaryTileset,
      secondary: layoutById.get(use.layout)!.secondaryTileset,
    }))
    .sort((a, b) => compare(a.layout, b.layout));
}

/** Effective bytes: staged wins over disk (R1), and a failed read is BAD_VALUE. */
function effectiveBytes(proj: Project, staged: FileOverlay, path: string): Buffer {
  const key = canonicalTilesetPath(path);
  const bytes = staged.get(key);
  if (bytes !== undefined) return bytes;
  try {
    return readFileSync(join(proj.paths.root, key));
  } catch (error) {
    return bad(`${key}: ${errorMessage(error)}`);
  }
}

function cells(proj: Project, path: string, cache: Map<string, readonly number[]>): readonly number[] {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  let buf: Buffer;
  try {
    buf = readFileSync(join(proj.paths.root, path));
  } catch (error) {
    return bad(`${path}: ${errorMessage(error)}`);
  }
  const ids = parseBlocks(buf, proj.profile).map((block) => block.metatileId);
  cache.set(path, ids);
  return ids;
}

/** R3: the first staged map of the file wins; otherwise its disk grid. */
function effectiveGrid(
  proj: Project,
  layout: Layout,
  grids: StagedGrids,
  byFile: Map<string, string[]>,
  cache: Map<string, readonly number[]>,
): GridIds {
  const file = layout.blockdataFilepath;
  const stagedName = (byFile.get(file) ?? []).find((name) => grids.has(name));
  if (stagedName !== undefined) return grids.get(stagedName)!;
  return cells(proj, file, cache);
}

function readEntries(buf: Buffer, local: number): TileEntry[] {
  const out: TileEntry[] = [];
  for (let i = 0; i < 8; i++) {
    const word = buf.readUInt16LE(local * METATILE_BYTES + i * 2);
    out.push({
      tile: word & 0x3ff,
      xFlip: (word & 0x400) !== 0,
      yFlip: (word & 0x800) !== 0,
      palette: (word >> 12) & 0x0f,
    });
  }
  return out;
}

const sameEntry = (a: TileEntry, b: TileEntry): boolean =>
  a.tile === b.tile && a.palette === b.palette && a.xFlip === b.xFlip && a.yFlip === b.yFlip;

function changedIndices(draft: readonly TileEntry[], original: readonly TileEntry[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < draft.length; i++) {
    const after = draft[i];
    const before = original[i];
    if (after !== undefined && before !== undefined && !sameEntry(after, before)) out.push(i);
  }
  return out;
}

function tileCount(proj: Project, symbol: string): number {
  const { width, height } = proj.tileset(symbol).tiles;
  return Math.floor(width / 8) * Math.floor(height / 8);
}

interface TileSource { symbol: string; local: number }

function tileSource(use: ConsumingUse, tile: number): TileSource {
  return tile < use.split.tiles
    ? { symbol: use.primary, local: tile }
    : { symbol: use.secondary, local: tile - use.split.tiles };
}

function paletteSource(use: ConsumingUse, palette: number): TileSource {
  return palette < use.split.pals
    ? { symbol: use.primary, local: palette }
    : { symbol: use.secondary, local: palette };
}

const sourcesDiffer = (sources: readonly { symbol: string; local: number }[]): boolean =>
  sources.some((source) => source.symbol !== sources[0]!.symbol || source.local !== sources[0]!.local);

function describeSources(sources: readonly { layout: string; symbol: string; local: number }[]): string {
  return sources.map((source) => `${source.layout} -> ${source.symbol}[${source.local}]`).join(", ");
}

/** G5: changed entries whose tile or palette resolves differently across consumers. */
export function gbaCrossHalfWarnings(proj: Project, tilesetSymbol: string, draft: GbaBlockDraft, original: readonly TileEntry[]): string[] {
  const uses = consumingUses(proj, tilesetSymbol);
  const warnings: string[] = [];
  for (let i = 0; i < draft.entries.length; i++) {
    const entry = draft.entries[i];
    const before = original[i];
    if (entry === undefined || before === undefined || sameEntry(entry, before)) continue;

    const tiles = uses.map((use) => ({ layout: use.layout, ...tileSource(use, entry.tile) }));
    if (sourcesDiffer(tiles)) {
      warnings.push(`entry ${i} tile differs: ${describeSources(tiles)}`);
    }

    const palettes = uses.map((use) => ({ layout: use.layout, ...paletteSource(use, entry.palette) }));
    if (sourcesDiffer(palettes)) {
      warnings.push(`entry ${i} palette differs: ${describeSources(palettes)}`);
    }
  }
  return warnings;
}

/** G4: every changed entry must be drawable by every layout consuming the tileset. */
function assertStructural(
  proj: Project,
  symbol: string,
  entries: readonly TileEntry[],
  changed: readonly number[],
  uses: readonly ConsumingUse[],
): void {
  for (const index of changed) {
    const entry = entries[index]!;
    for (const use of uses) {
      const tileOk = entry.tile < use.split.tiles
        ? entry.tile < tileCount(proj, use.primary)
        : entry.tile - use.split.tiles < tileCount(proj, use.secondary);
      const palettes = entry.palette < use.split.pals
        ? proj.tileset(use.primary).palettes
        : proj.tileset(use.secondary).palettes;
      const paletteOk = entry.palette < NUM_PALS_TOTAL && palettes[entry.palette] !== undefined;
      if (!tileOk || !paletteOk) {
        throw new BlockEditRefusal(
          "SPLIT_LIMIT",
          `${symbol}: entry ${index} ${tileOk ? "palette" : "tile"} ${tileOk ? entry.palette : entry.tile} is invalid in layout ${use.layout}`,
        );
      }
    }
  }
}

/** G8: another map on a consuming layout draws the layout's target id. */
function usedElsewhere(
  proj: Project,
  mapName: string,
  local: number,
  grids: StagedGrids,
  uses: readonly ConsumingUse[],
  byFile: Map<string, string[]>,
  byLayout: Map<string, string[]>,
  cache: Map<string, readonly number[]>,
): boolean {
  for (const use of uses) {
    const target = use.role === "primary" ? local : use.split.metatiles + local;
    const layout = use.layoutObject;
    const names = byLayout.get(use.layout) ?? [];
    if (names.length === 0) continue;
    const border = cells(proj, layout.borderFilepath, cache);
    for (const name of names) {
      if (name === mapName) continue;
      if (effectiveGrid(proj, layout, grids, byFile, cache).includes(target) || border.includes(target)) {
        return true;
      }
    }
  }
  return false;
}

export function planGbaBlockEdit(proj: Project, req: GbaBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan {
  try {
    return planGbaBlockEditInner(proj, req, staged, grids);
  } catch (error) {
    if (error instanceof PathEscapeError) throw error;
    if (error instanceof BlockEditRefusal) throw error;
    throw new BlockEditRefusal(
      "BAD_VALUE",
      `${req.map}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function planGbaBlockEditInner(proj: Project, req: GbaBlockEditRequest, staged: FileOverlay, grids: StagedGrids): BlockEditPlan {
  assertNotTripleLayer(proj.profile, proj.paths.porymapCfg);

  if (!Number.isInteger(req.metatileId) || req.metatileId < 0) bad(`${req.map}: invalid metatile id ${req.metatileId}`);

  const layout = proj.layoutForMap(req.map);
  assertLayoutUsable(proj, layout);
  const split = proj.splitFor(layout);
  const primaryRole = req.metatileId < split.metatiles;
  const symbol = primaryRole ? layout.primaryTileset : layout.secondaryTileset;
  const local = primaryRole ? req.metatileId : req.metatileId - split.metatiles;

  const paths = proj.tilesetPaths(symbol);
  const metaPath = canonicalTilesetPath(paths.metatilesBin);
  const attrPath = canonicalTilesetPath(paths.attributesBin);
  const metaBuf = effectiveBytes(proj, staged, metaPath);
  const attrBuf = effectiveBytes(proj, staged, attrPath);

  if (metaBuf.length % METATILE_BYTES !== 0) {
    bad(`${metaPath}: buffer length ${metaBuf.length} is not a multiple of ${METATILE_BYTES}`);
  }
  const count = metaBuf.length / METATILE_BYTES;
  const attributesSize = proj.profile.metatileAttributesSize;
  if (attrBuf.length % attributesSize !== 0) {
    bad(`${attrPath}: ${attrBuf.length} bytes is not a whole number of ${attributesSize}-byte attribute words`);
  }
  if (attrBuf.length !== count * attributesSize) {
    bad(`${attrPath}: ${attrBuf.length / attributesSize} attribute words for ${count} metatiles`);
  }
  if (local >= count) bad(`${metaPath}: metatile index ${local} is outside the editable range 0-${count - 1}`);

  const draft = req.draft;
  if (draft === null || draft === undefined
    || !Array.isArray(draft.entries)
    || draft.entries.length !== 8
    || draft.entries.some((entry) => entry === null || typeof entry !== "object")) {
    const got = draft !== null && draft !== undefined && Array.isArray(draft.entries) ? `, got ${draft.entries.length}` : "";
    bad(`${metaPath}: expected 8 tile entries${got}`);
  }
  if (!Number.isInteger(draft.behavior)) bad(`${attrPath}: behavior ${String(draft.behavior)} is not an integer`);
  if (!Number.isInteger(draft.layerType)) bad(`${attrPath}: layerType ${String(draft.layerType)} is not an integer`);
  for (let i = 0; i < 8; i++) {
    const entry = draft.entries[i]!;
    if (typeof entry.xFlip !== "boolean" || typeof entry.yFlip !== "boolean") {
      bad(`${metaPath}: entry ${i} flips must be boolean`);
    }
  }

  // The shared patchers own the tile/palette and behavior/layerType masks. One
  // call per file; the BAD_VALUE stage still precedes SHARED_GRID and the append
  // limit, so save-as-new validates through its append at the effective count.
  const fields = { behavior: draft.behavior, layerType: draft.layerType };
  const append = req.mode === "saveAsNew";
  const target = append ? count : local;
  const metaAfter = patchGbaMetatile(metaBuf, target, draft.entries, metaPath);
  const attrAfter = patchGbaAttribute(attrBuf, target, proj.profile, fields, attrPath, append ? local : undefined);

  if (req.mode === "saveAsNew" && req.from === "map") {
    const cell = req.cell;
    if (cell === undefined || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)
      || cell.x < 0 || cell.y < 0 || cell.x >= layout.width || cell.y >= layout.height) {
      bad(`${req.map}: cell is outside the map`);
    }
  }

  const byFile = gbaMapsByGridFile(proj);
  if (req.mode === "saveAsNew" && req.from === "map") {
    const sharing = byFile.get(layout.blockdataFilepath) ?? [];
    if (sharing.length >= 2) {
      throw new BlockEditRefusal("SHARED_GRID", `${req.map}: shared grid used by ${sharing.join(", ")}`);
    }
  }

  const uses = consumingUses(proj, symbol);
  const original = readEntries(metaBuf, local);
  if (req.mode === "saveAsNew") {
    for (const use of uses) {
      const limit = use.role === "primary"
        ? use.split.metatiles
        : proj.constants.metatilesTotal - use.split.metatiles;
      if (!(count < limit)) {
        throw new BlockEditRefusal(
          "SPLIT_LIMIT",
          `${metaPath}: layout ${use.layout} (${use.role}) allows ${limit} metatiles; cannot append metatile ${count}`,
        );
      }
    }
  }

  const changed = changedIndices(draft.entries, original);
  assertStructural(proj, symbol, draft.entries, changed, uses);

  const cellsCache = new Map<string, readonly number[]>();
  const candidates = new Map<string, Buffer>([[metaPath, metaAfter], [attrPath, attrAfter]]);
  const edits = [...candidates]
    .filter(([path, after]) => !(path === metaPath ? metaBuf : attrBuf).equals(after))
    .map(([path, after]) => ({ path, before: path === metaPath ? metaBuf : attrBuf, after }))
    .sort((a, b) => compare(a.path, b.path));

  const confirm = req.mode !== "saveAsNew" && edits.length > 0
    && usedElsewhere(proj, req.map, local, grids, uses, byFile, gbaMapsByLayout(proj), cellsCache);

  const revision = blockEditRevision(
    new Map([[metaPath, metaBuf], [attrPath, attrBuf]]),
    effectiveGrid(proj, layout, grids, byFile, cellsCache),
  );

  const newBlockId = req.mode === "saveAsNew"
    ? (primaryRole ? count : split.metatiles + count)
    : undefined;
  const placement = req.mode === "saveAsNew" && req.from === "map"
    ? { x: req.cell!.x, y: req.cell!.y, blockId: newBlockId! }
    : undefined;

  return {
    edits,
    warnings: gbaCrossHalfWarnings(proj, symbol, draft, original),
    usage: gbaBlockUsage(proj, symbol, local, grids),
    confirm,
    revision,
    ...(newBlockId !== undefined ? { newBlockId } : {}),
    ...(placement !== undefined ? { placement } : {}),
  };
}
