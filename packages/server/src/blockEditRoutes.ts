import type { IncomingMessage } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/src/project.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import { BlockEditRefusal, type BlockEditPlan, type FileOverlay, type StagedGrids } from "@pokemap/core/src/blockEdit/types.js";
import { planGbaBlockEdit, type GbaBlockDraft, type GbaBlockEditRequest } from "@pokemap/core/src/blockEdit/gbaOps.js";
import { gbcSheetToTileId, planGbcBlockEdit, resolveGbcEditTarget, type GbcBlockDraft, type GbcBlockEditRequest } from "@pokemap/core/src/blockEdit/gbcOps.js";
import { gbaGridIds, gbcGridIds } from "@pokemap/core/src/blockEdit/grids.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { gbaConsumingLayouts } from "@pokemap/core/src/blockEdit/usage.js";
import { loadGbcReservedTiles } from "@pokemap/core/src/blockEdit/gbcSheet.js";
import { gbaDefineValues } from "@pokemap/core/src/addEvent/gbaOptions.js";
import { parseConstDefs } from "@pokemap/core/src/gbc/load/asm.js";
import { pngTileIndex } from "@pokemap/core/src/gbc/load/tileset.js";
import { resolveFromTables } from "@pokemap/core/src/gbc/load/palette.js";
import { renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import { renderMetatile } from "@pokemap/core/src/render/metatile.js";
import { drawTile } from "@pokemap/core/src/render/tile.js";
import { createRaster, type Raster } from "@pokemap/core/src/render/raster.js";
import { maskShift } from "@pokemap/core/src/config/engine.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { createGbcEditSessionStore } from "./gbcEditSessions.js";
import { ownedTilesetPaths, type OwnershipEntry } from "./blockEditOwnership.js";
import { decodeMapName, parseTimeParam } from "./gbcRoutes.js";
import { readBody } from "./index.js";

type Send = (code: number, body: unknown) => void;
type Routes = { handle(req: IncomingMessage, url: URL, send: Send): boolean };
type CommonDeps = {
  syncOverlay(): number;
  overlay(): FileOverlay;
  sessionBody(name: string): unknown;
  hasMap(name: string): boolean;
};
type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);
const bad = (message: string): never => { throw new BlockEditRefusal("BAD_VALUE", message); };
const integer = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return bad(`${field}: expected a non-negative integer`);
  return value;
};
function queryInteger(url: URL, field: string): number {
  const values = url.searchParams.getAll(field);
  if (values.length !== 1 || !/^\d+$/.test(values[0]!)) return bad(`${field}: expected a non-negative integer`);
  return integer(Number(values[0]), field);
}
function selector(url: URL): { id: number } | { x: number; y: number } {
  const block = url.searchParams.has("block"), x = url.searchParams.has("x"), y = url.searchParams.has("y");
  if (block && !x && !y) return { id: queryInteger(url, "block") };
  if (!block && x && y) return { x: queryInteger(url, "x"), y: queryInteger(url, "y") };
  return bad("block: supply either block or both x and y");
}
function request(body: unknown): Obj {
  if (!object(body)) return bad("body: expected a JSON object");
  if (!object(body.request)) return bad("request: expected an object");
  const req = body.request;
  if (req.mode !== "ok" && req.mode !== "saveAsNew") return bad("request.mode: expected ok or saveAsNew");
  if (req.from !== "map" && req.from !== "palette") return bad("request.from: expected map or palette");
  if (!object(req.draft)) return bad("draft: expected an object");
  return req;
}
function owner(entries: Iterable<[string, OwnershipEntry]>, plan: BlockEditPlan): string | null {
  for (const [name, entry] of entries) {
    const paths = ownedTilesetPaths(entry);
    if (plan.usage.files.some(path => paths.has(path))) return name;
  }
  return null;
}
function nextId(plan: () => BlockEditPlan): number | null {
  try { return plan().newBlockId ?? null; }
  catch (error) {
    if (error instanceof BlockEditRefusal && (error.code === "BLOCK_CAP" || error.code === "SPLIT_LIMIT")) return null;
    throw error;
  }
}
function time(url: URL) {
  const parsed = parseTimeParam(url);
  if ("error" in parsed) return bad(`time: ${parsed.error}`);
  return parsed.time;
}
function requireGridCell(path: string, count: number, width: number, height: number, index: number): void {
  if (index >= count) {
    throw new BadGrid(`${path}: has ${count} blocks, fewer than ${width}×${height}`);
  }
}
function requireWholeGrid(path: string, count: number, width: number, height: number): void {
  if (count < width * height) {
    throw new BadGrid(`${path}: has ${count} blocks, fewer than ${width}×${height}`);
  }
}
class BadGrid extends Error {}
// Shared enum-or-define reader. Unreadable enum members (and every implicit successor until the next
// member with a readable literal `= n`) are skipped; #defines still override enum values. Never throws.
function cPrefixedValues(root: string, path: string, prefix: string): { name: string; value: number }[] {
  const header = existsSync(path) ? readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "") : "";
  const values = new Map<string, number>();
  for (const match of header.matchAll(/\benum\s*(?:\w+\s*)?\{([^}]*)\}/g)) {
    if (!match[1]!.includes(prefix)) continue;
    let next = 0, skipping = false;
    for (const part of match[1]!.split(",")) {
      if (!part.trim()) continue;
      const member = part.trim().match(/^(\w+)(?:\s*=\s*([+-]?(?:0x[\da-f]+|\d+))(?:u(?:ll?)?|ll?u?)?)?$/i);
      if (!member) { skipping = true; continue; }
      if (member[2] !== undefined) {
        const literal = member[2], sign = literal.startsWith("-") ? -1 : 1;
        const digits = literal.replace(/^[+-]/, "");
        const radix = /^0x/i.test(digits) ? 16 : /^0\d/.test(digits) ? 8 : 10;
        const parsed = radix === 8 && /[89]/.test(digits) ? NaN : sign * Number.parseInt(digits, radix);
        if (!Number.isSafeInteger(parsed)) { skipping = true; continue; }
        next = parsed;
        skipping = false;
      } else if (skipping) continue;
      if (member[1]!.startsWith(prefix)) values.set(member[1]!, next);
      next++;
    }
  }
  for (const [name, value] of gbaDefineValues(root, header)) {
    if (name.startsWith(prefix) && value !== undefined) values.set(name, value);
  }
  return [...values].map(([name, value]) => ({ name, value })).sort((a, b) => a.value - b.value);
}
function gbaLayerTypes(project: Project): { name: string; value: number }[] {
  const prefix = "METATILE_LAYER_TYPE_";
  const values = cPrefixedValues(project.paths.root, `${project.paths.root}/include/global.fieldmap.h`, prefix)
    .map(({ name, value }) => ({ name: name.slice(prefix.length), value }));
  return values.length > 0 ? values
    : ["NORMAL", "COVERED", "SPLIT"].map((name, value) => ({ name, value }));
}
// Binary bodies are passed to the hub's PNG-aware send adapter; JSON uses the same callback.
function routes(deps: CommonDeps, read: (name: string, url: URL, version: number) => unknown,
  sheet: (name: string, url: URL) => Raster, preview: (name: string, url: URL, body: unknown) => Raster): Routes {
  return { handle(req, url, send) {
    const block = /^\/api\/edit\/([^/]+)\/block$/.exec(url.pathname);
    const image = /^\/api\/block-sheet\/([^/]+)\.png$/.exec(url.pathname);
    const draft = /^\/api\/edit\/([^/]+)\/block\/preview$/.exec(url.pathname);
    const match = req.method === "GET" ? block ?? image : req.method === "POST" ? draft : null;
    if (!match) return false;
    const fail = (error: unknown, planner = false) => {
      if (error instanceof BadGrid) { send(409, { error: error.message, code: "BAD_GRID" }); return; }
      const refusal = error instanceof BlockEditRefusal;
      send(refusal ? (planner || error instanceof GetConflict || error.code !== "BAD_VALUE" ? 409 : 400) : 500,
        { error: error instanceof Error ? error.message : String(error), code: refusal ? error.code : "INTERNAL_ERROR" });
    };
    try {
      const version = deps.syncOverlay();
      const name = decodeMapName(match[1]!);
      if (name === undefined) { send(400, { error: `malformed map name ${match[1]}`, code: "BAD_VALUE" }); return true; }
      if (!deps.hasMap(name)) { send(404, { error: `no map ${name}`, code: "NOT_FOUND" }); return true; }
      if (draft && req.method === "POST") {
        void readBody(req).then(text => {
          let body: unknown;
          try { body = JSON.parse(text); }
          catch { return bad("body: invalid JSON"); }
          // The overlay may change while the body is arriving. Render the current view.
          deps.syncOverlay();
          send(200, { png: encodePng(preview(name, url, body)).toString("base64") });
        }).catch(error => fail(error));
      } else if (image) send(200, encodePng(sheet(name, url)));
      else send(200, read(name, url, version));
    } catch (error) { fail(error); }
    return true;
  } };
}

export function createGbaBlockEditRoutes(
  deps: CommonDeps & { project: Project; store: ReturnType<typeof createEditSessionStore> },
): Routes {
  const { project, store } = deps;
  const grids = (): StagedGrids => new Map(store.entries().map(([name, entry]) =>
    [name, gbaGridIds(entry.session.blocks, project.profile.blockMetatileIdMask)]));
  const context = (name: string) => {
    const layout = project.layoutForMap(name), split = project.splitFor(layout);
    const primary = project.tileset(layout.primaryTileset), secondary = project.tileset(layout.secondaryTileset);
    const primaryTiles = primary.tiles.width / 8 * (primary.tiles.height / 8);
    const secondaryTiles = secondary.tiles.width / 8 * (secondary.tiles.height / 8);
    const tileCount = split.tiles + secondaryTiles;
    const tileIds = Array.from({ length: tileCount }, (_, i) => i < primaryTiles || i >= split.tiles ? i : null);
    return { layout, split, primary, secondary, tileCount, tileIds };
  };
  const options = () => ({
    behaviors: cPrefixedValues(project.paths.root,
      `${project.paths.root}/include/constants/metatile_behaviors.h`, "MB_"),
    layerTypes: gbaLayerTypes(project),
  });
  return routes(deps, (name, url, version) => {
    const c = context(name), selection = selector(url), stagedGrids = grids();
    let id: number;
    if ("id" in selection) id = selection.id;
    else {
      if (selection.x >= c.layout.width || selection.y >= c.layout.height) return bad("cell: outside the map");
      const sharing = project.mapNames().filter(map => project.layoutForMap(map).blockdataFilepath === c.layout.blockdataFilepath)
        .sort().find(map => stagedGrids.has(map));
      const ids = sharing === undefined ? gbaGridIds(parseBlocks(readFileSync(`${project.paths.root}/${c.layout.blockdataFilepath}`), project.profile), project.profile.blockMetatileIdMask) : stagedGrids.get(sharing)!;
      requireGridCell(c.layout.blockdataFilepath, ids.length, c.layout.width, c.layout.height, selection.y * c.layout.width + selection.x);
      id = ids[selection.y * c.layout.width + selection.x]!;
    }
    const secondary = id >= c.split.metatiles, ts = secondary ? c.secondary : c.primary;
    const local = secondary ? id - c.split.metatiles : id;
    if (local >= ts.metatileCount) return bad(`block: invalid metatile id ${id}`);
    const block: GbaBlockDraft = { entries: ts.metatile(local), behavior: ts.behavior(local), layerType: ts.layerType(local) };
    const req: GbaBlockEditRequest = { map: name, metatileId: id, mode: "ok", from: "palette", draft: block };
    const symbol = secondary ? c.layout.secondaryTileset : c.layout.primaryTileset;
    const file = canonicalTilesetPath(project.tilesetPaths(symbol).metatilesBin);
    const cap = Math.min(...project.tilesetSymbols()
      .filter(alias => canonicalTilesetPath(project.tilesetPaths(alias).metatilesBin) === file)
      .flatMap(alias => gbaConsumingLayouts(project, alias))
      .map(use => use.role === "primary" ? use.split.metatiles : project.constants.metatilesTotal - use.split.metatiles));
    let plan: BlockEditPlan;
    try { plan = planGbaBlockEdit(project, req, deps.overlay(), stagedGrids); }
    catch (error) {
      // GET planner refusals are conflicts, including an invalid effective source.
      if (error instanceof BlockEditRefusal) return getConflict(error);
      throw error;
    }
    return { blockId: id, viaBorder: false, revision: plan.revision, block,
      sheet: { url: `/api/block-sheet/${encodeURIComponent(name)}.png?tv=${version}`, tileCount: c.tileCount, tileIds: c.tileIds },
      options: options(), usage: plan.usage, owner: owner(store.entries(), plan),
      limits: { nextId: ts.metatileCount >= cap ? null : nextId(() => planGbaBlockEdit(project, { ...req, mode: "saveAsNew" }, deps.overlay(), stagedGrids)),
        cap } };
  }, (name, url) => {
    const c = context(name), pal = url.searchParams.has("pal") ? queryInteger(url, "pal") : 0;
    if (pal > 12) return bad("pal: expected an integer from 0 to 12");
    const palette = (pal < c.split.pals ? c.primary : c.secondary).palettes[pal] ?? [];
    const raster = createRaster(128, Math.ceil(c.tileCount / 16) * 8);
    for (let i = 0; i < c.tileCount; i++) {
      if (c.tileIds[i] === null) continue;
      drawTile(raster, i < c.split.tiles ? c.primary.tiles : c.secondary.tiles,
        i < c.split.tiles ? i : i - c.split.tiles, palette, i % 16 * 8, Math.floor(i / 16) * 8, false, false);
    }
    return raster;
  }, (name, _url, body) => {
    const req = request(body), c = context(name), id = integer(req.metatileId, "request.metatileId");
    const d = req.draft as Obj;
    if (!Array.isArray(d.entries) || d.entries.length !== 8 || d.entries.some(entry => !object(entry))) return bad("draft.entries: expected 8 tile entries");
    const entries = d.entries.map((entry: Obj) => {
      const tile = integer(entry.tile, "draft.entries"), palette = integer(entry.palette, "draft.entries");
      if (tile > 0x3ff || c.tileIds[tile] == null) return bad(`draft.entries: tile ${tile} is outside the sheet`);
      if (palette > 15 || typeof entry.xFlip !== "boolean" || typeof entry.yFlip !== "boolean") return bad("draft.entries: invalid palette or flip");
      return { tile, palette, xFlip: entry.xFlip, yFlip: entry.yFlip };
    });
    const behavior = integer(d.behavior, "draft.behavior"), layer = integer(d.layerType, "draft.layerType");
    if (behavior > project.profile.metatileBehaviorMask || (behavior & ~project.profile.metatileBehaviorMask) !== 0) return bad("draft.behavior: value exceeds mask");
    const layerMask = project.profile.metatileLayerTypeMask >>> maskShift(project.profile.metatileLayerTypeMask);
    if (layer > layerMask || (layer & ~layerMask) !== 0) return bad("draft.layerType: value exceeds mask");
    const image = renderMetatile(id, c.primary, c.secondary, c.split, project.profile, { overrideEntries: entries });
    if (image.outOfRange) return bad(`request.metatileId: invalid metatile ${id}`);
    return image;
  });
}

// Preserve the planner's GET status without changing the shared refusal type.
function getConflict(error: BlockEditRefusal): never { throw new GetConflict(error); }
class GetConflict extends BlockEditRefusal {
  constructor(error: BlockEditRefusal) { super(error.code, error.message); }
}

export function createGbcBlockEditRoutes(
  deps: CommonDeps & { project: GbcProject; store: ReturnType<typeof createGbcEditSessionStore> },
): Routes {
  const { project, store } = deps;
  const grids = (): StagedGrids => new Map(store.entries().map(([name, entry]) => [name, gbcGridIds(entry.session.blocks)]));
  const palettes = () => [...parseConstDefs(readFileSync(`${project.root}/constants/tileset_constants.asm`, "utf8"))]
    .filter(([name]) => name.startsWith("PAL_BG_")).map(([name, value]) => ({ name: name.slice(7), value }));
  const collisions = () => [...project.collisionInfo()].flatMap(([value, info]) => info.name === null ? [] : [{ name: info.name.replace(/^COLL_/, ""), value }]);
  const context = (name: string) => {
    const map = project.map(name), ts = project.tileset(map.tileset), sheetToId = gbcSheetToTileId(ts);
    return { map, ts, tileIds: ts.tiles.map((_, i) => sheetToId(i)) };
  };
  return routes(deps, (name, url, version) => {
    const c = context(name), selection = selector(url), stagedGrids = grids();
    if (!("id" in selection)) {
      if (selection.x >= c.map.width || selection.y >= c.map.height) return bad("cell: outside the map");
      const sharing = project.maps.filter(map => map.blkPath === c.map.blkPath && stagedGrids.has(map.name))
        .map(map => map.name).sort()[0];
      const count = sharing === undefined ? readFileSync(`${project.root}/${c.map.blkPath}`).length : stagedGrids.get(sharing)!.length;
      requireWholeGrid(c.map.blkPath, count, c.map.width, c.map.height);
    }
    const target = "id" in selection ? { blockId: selection.id, viaBorder: false } : resolveGbcEditTarget(project, name, selection, stagedGrids);
    const source = c.ts.metatiles[target.blockId], collision = c.ts.collision[target.blockId];
    if (!source || !collision) return bad(`block: invalid block id ${target.blockId}`);
    const collisionOptions = collisions(), paletteOptions = palettes();
    const names = new Map(collisionOptions.map(({ name, value }) => [value, name]));
    const palNames = new Map(paletteOptions.map(({ name, value }) => [value, name]));
    const draft: GbcBlockDraft = { tiles: [...source.tiles],
      collision: [collision.tl, collision.tr, collision.bl, collision.br].map(value => {
        const name = names.get(value); if (name === undefined) return bad(`block.collision: unknown collision ${value}`); return name;
      }) as GbcBlockDraft["collision"], palettes: [] };
    const req: GbcBlockEditRequest = { map: name, blockId: target.blockId, mode: "ok", from: "palette", draft };
    let plan: BlockEditPlan;
    try { plan = planGbcBlockEdit(project, req, deps.overlay(), stagedGrids); }
    catch (error) { if (error instanceof BlockEditRefusal) return getConflict(error); throw error; }
    return { ...target, revision: plan.revision,
      block: { tiles: draft.tiles, collision: draft.collision, tilePalettes: draft.tiles.map(tile => palNames.get(c.ts.palMap[tile]?.pal ?? -1) ?? "") },
      sheet: { url: `/api/block-sheet/${encodeURIComponent(name)}.png?tv=${version}&time=${time(url)}`,
        tileCount: c.ts.tiles.length, tileIds: c.tileIds, reservedTiles: [...loadGbcReservedTiles(project.root)].sort((a, b) => a - b) },
      options: { collision: collisionOptions.map(entry => entry.name), palettes: paletteOptions.map(entry => entry.name) },
      usage: plan.usage, owner: owner(store.entries(), plan), limits: { nextId: nextId(() => planGbcBlockEdit(project, { ...req, mode: "saveAsNew" }, deps.overlay(), stagedGrids)), cap: 256 } };
  }, (name, url) => {
    const c = context(name), mapPalettes = resolveFromTables(project.paletteTables(), c.map, { time: time(url) });
    const raster = createRaster(128, Math.ceil(c.ts.tiles.length / 16) * 8);
    for (let i = 0; i < c.ts.tiles.length; i++) {
      const id = c.tileIds[i];
      if (id == null) continue;
      const palette = mapPalettes[c.ts.palMap[id]!.pal]!;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const rgb = palette[c.ts.tiles[i]![y * 8 + x]!]!;
        const offset = ((Math.floor(i / 16) * 8 + y) * 128 + i % 16 * 8 + x) * 4;
        raster.data.set([rgb.r, rgb.g, rgb.b, 255], offset);
      }
    }
    return raster;
  }, (name, url, body) => {
    const req = request(body), c = context(name), id = integer(req.blockId, "request.blockId"), d = req.draft as Obj;
    if (!c.ts.metatiles[id]) return bad(`request.blockId: invalid block ${id}`);
    if (!Array.isArray(d.tiles) || d.tiles.length !== 16 || d.tiles.some(tile => !Number.isInteger(tile))) return bad("draft.tiles: expected 16 integers");
    const tiles = d.tiles as number[];
    for (const tile of tiles) if (pngTileIndex(c.ts, tile) === null) return bad(`draft.tiles: tile ${tile} is outside the sheet`);
    const collisionNames = new Set(collisions().map(entry => entry.name));
    if (!Array.isArray(d.collision) || d.collision.length !== 4 || d.collision.some(name => typeof name !== "string" || !collisionNames.has(name))) return bad("draft.collision: expected four collision names");
    if (!Array.isArray(d.palettes)) return bad("draft.palettes: expected an array");
    const palNames = new Map(palettes().map(({ name, value }) => [name, value]));
    const palMap = c.ts.palMap.map(entry => entry === null ? null : { ...entry });
    const changed = new Map<number, number>();
    for (const entry of d.palettes) {
      if (!object(entry)) return bad("draft.palettes: expected palette entries");
      const square = integer(entry.square, "draft.palettes"), palette = typeof entry.palName === "string" ? palNames.get(entry.palName) : undefined;
      if (square >= 16 || palette === undefined || (entry.scope !== "all" && entry.scope !== "local")) return bad("draft.palettes: invalid palette entry");
      const tile = tiles[square]!;
      if (changed.has(tile) && changed.get(tile) !== palette) return bad("draft.palettes: conflicting palette entries");
      changed.set(tile, palette);
      palMap[tile] = { ...palMap[tile]!, pal: palette };
    }
    const ts = { ...c.ts, palMap, metatiles: c.ts.metatiles.map((block, index) => index === id ? { tiles } : block) };
    // Reuse the map renderer so time palettes and per-group roof pixels stay identical.
    return renderGbcMapMetatile({ ...project, tileset: symbol => symbol === c.map.tileset ? ts : project.tileset(symbol) }, name, id, { time: time(url) });
  });
}
