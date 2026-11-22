/** Task 11 block-editor route oracle, shared by both family test files. Expected data comes from disk, earlier HTTP responses and literals. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { unfilterScanlines } from "@pokemap/core/src/load/png.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { gbaConsumingLayouts } from "@pokemap/core/src/blockEdit/usage.js";
import type { TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { stageTilesetPlan, type BlockEditPlan } from "../../src/blockEditOwnership.js";
import { createProjectHandler } from "../../src/index.js";
import { createGbcProjectHandler } from "../../src/gbcRoutes.js";
import * as gbaSessions from "../../src/editSessions.js";
import * as gbcSessions from "../../src/gbcEditSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTilesetProject.js";
import { copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT } from "@pokemap/core/test/gbc/helpers/corpus.js";

const buildPlan = (edits: TilesetFileEdit[]): BlockEditPlan => ({
  edits, warnings: [], usage: { files: [], tilesets: [], maps: [], sharedGrids: [] },
  confirm: false, revision: "",
});
const restoreBytes = (paths: string[]) => {
  const snapshots = paths.map(path => [path, readFileSync(path)] as const);
  return () => { for (const [path, bytes] of snapshots) writeFileSync(path, bytes); };
};

type Pair = { a: string; b: string; path: string };
export function suite(family: "gba" | "gbc") {
  const present = family === "gba" ? hasProject(SUBJECT_ROOT) : hasGbcProject(GBC_SUBJECT_ROOT);
  describe.skipIf(!present)(`${family.toUpperCase()} block-edit read routes (Task 11a)`, () => {
    let root: string;
    let server: Server;
    let base: string;
    let gba: Project;
    let gbc: GbcProject;
    let pair: Pair;
    let restoreCollisions: (() => void) | undefined;
    let other: string;
    let store: ReturnType<typeof gbaSessions.createEditSessionStore> | ReturnType<typeof gbcSessions.createGbcEditSessionStore>;
    const encoded = (name: string) => encodeURIComponent(name);
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(base + path, body === undefined ? {} : {
        method: "POST", body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const ok = async (path: string, body?: unknown) => {
      const result = await request(path, body);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return result.body;
    };
    const edit = (name: string, route: string, body?: unknown) =>
      ok(`/api/edit/${encoded(name)}/${route}`, body);
    const mapGet = (name: string) => ok(`/api/map/${encoded(name)}`);
    const block = (name: string, query: string) =>
      ok(`/api/edit/${encoded(name)}/block?${query}${family === "gbc" ? "&time=day" : ""}`);
    const png = async (path: string) => {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      return Buffer.from(await response.arrayBuffer());
    };
    const paint = async (name: string, id: number) => {
      await edit(name, "paint/begin", {});
      await edit(name, "paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }],
        stamp: { width: 1, height: 1, cells: [{ metatileId: id }] }, origin: { x: 0, y: 0 },
      });
      return edit(name, "paint/end", {});
    };
    const appendPlan = (): BlockEditPlan => {
      const before = readFileSync(resolve(root, pair.path));
      const edits: TilesetFileEdit[] = [{
        path: pair.path, before, after: Buffer.concat([before, before.subarray(0, 16)]),
      }];
      if (family === "gba") {
        const paths = gba.tilesetPaths(gba.layoutForMap(pair.a).primaryTileset);
        const attrPath = canonicalTilesetPath(paths.attributesBin);
        const attributes = readFileSync(resolve(root, attrPath));
        const size = gba.profile.metatileAttributesSize;
        if (attributes.length !== before.length / 16 * size) {
          throw new Error("fixture metatile and attribute counts differ");
        }
        edits.push({
          path: attrPath, before: attributes,
          after: Buffer.concat([attributes, attributes.subarray(0, size)]),
        });
      } else {
        const collision = canonicalTilesetPath(gbc.tileset(gbc.map(pair.a).tileset).collisionPath);
        const bytes = readFileSync(resolve(root, collision));
        const text = bytes.toString("utf8");
        const line = text.match(/^[ \t]*tilecoll\b.*$/gm)?.at(-1);
        if (!line) throw new Error(`no tilecoll in ${collision}`);
        edits.push({ path: collision, before: bytes, after: Buffer.from(`${text.replace(/\s*$/, "\n")}${line}\n`) });
      }
      return buildPlan(edits);
    };
    const stage = (name: string) => stageTilesetPlan(store, name, appendPlan(), "read oracle");
    const identity = (id: number, body: any) => ({
      request: family === "gba"
        ? { metatileId: id, mode: "ok", from: "palette", draft: body.block }
        : { blockId: id, mode: "ok", from: "palette", draft: {
          tiles: body.block.tiles, collision: body.block.collision, palettes: [],
        } },
    });
    const idFor = async () => {
      const map = await mapGet(pair.a);
      return family === "gba" ? 0 : Math.min(1, map.metatileCount - 1);
    };
    const dimensions = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    // Sheet sizes come from the tile PNGs on disk (IHDR), never from the route under test.
    const pngTiles = (path: string) => {
      const { width, height } = dimensions(readFileSync(resolve(root, path)));
      return (width / 8) * (height / 8);
    };
    const gbcSheetTiles = (name: string) => pngTiles(gbc.tileset(gbc.map(name).tileset).gfxPath);
    const gbaSheetTiles = (name: string) => {
      const layout = gba.layoutForMap(name);
      return {
        primary: pngTiles(gba.tilesetPaths(layout.primaryTileset).tilesPng),
        secondary: pngTiles(gba.tilesetPaths(layout.secondaryTileset).tilesPng),
        split: gba.splitFor(layout).tiles,
      };
    };
    const pixels = (bytes: Buffer) => {
      const chunks: Buffer[] = [];
      for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") {
          chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
        }
        offset += length + 12;
      }
      expect(bytes[24]).toBe(8);
      expect(bytes[25]).toBe(6);
      const { width, height } = dimensions(bytes);
      return unfilterScanlines(inflateSync(Buffer.concat(chunks)), width * 4, height, 4);
    };
    const historyLength = (name: string) =>
      (store.open(name).stack as unknown as { undoStack: unknown[] }).undoStack.length;
    // Task 11b: check and apply take `{ request, revision }`. Expected values below come from an
    // earlier GET block reply, from disk, or from literals; never from the route being exercised.
    const blockCheck = (name: string, body: unknown) =>
      request(`/api/edit/${encoded(name)}/block/check`, body);
    const blockApply = (name: string, body: unknown) =>
      request(`/api/edit/${encoded(name)}/block/apply`, body);
    const checkBody = (data: any) => ({ request: identity(data.blockId, data).request, revision: data.revision });
    // One planner-visible field changes, so a plan has edits and (for saveAsNew) no placement.
    const changedDraft = (data: any) => {
      const body = identity(data.blockId, data);
      if (family === "gba") {
        const mask = gba.profile.metatileBehaviorMask;
        const next = (body.request.draft.behavior ^ 1) & mask;
        if (next === body.request.draft.behavior) throw new Error("fixture needs a behavior mask with bit 0");
        body.request.draft.behavior = next;
      } else {
        const other = (data.options.collision as string[]).find(name => name !== data.block.collision[0]);
        if (other === undefined) throw new Error("fixture needs two GBC collision names");
        body.request.draft.collision[0] = other;
      }
      return body.request;
    };
    const stagedEdits = (name: string): TilesetFileEdit[] =>
      ((store.open(name).session.tilesetEdits ?? []) as TilesetFileEdit[]);
    const gbaTilesetFile = (symbol: string) =>
      canonicalTilesetPath(gba.tilesetPaths(symbol).metatilesBin);
    const gbaFileCount = (symbol: string) => readFileSync(resolve(root, gbaTilesetFile(symbol))).length / 16;
    const gbaCandidates = (name: string): number[] => {
      const layout = gba.layoutForMap(name), split = gba.splitFor(layout);
      const ids: number[] = [];
      for (let id = 0; id < Math.min(gbaFileCount(layout.primaryTileset), split.metatiles); id++) ids.push(id);
      for (let local = 0; local < gbaFileCount(layout.secondaryTileset); local++) ids.push(split.metatiles + local);
      return ids;
    };
    const gbaGridCache = new Map<string, readonly number[]>();
    const gbaCells = (path: string): readonly number[] => {
      const cached = gbaGridCache.get(path);
      if (cached) return cached;
      const ids = parseBlocks(readFileSync(resolve(root, path)), gba.profile).map(block => block.metatileId);
      gbaGridCache.set(path, ids);
      return ids;
    };
    // The planner's own confirm predicate (gbaOps.ts `usedElsewhere`), recomputed from disk:
    // another map on a consuming layout draws the layout's target id (role-adjusted, in its
    // grid or border). Cells of the other half are not the edited file and are never counted.
    const gbaConfirm = (name: string, id: number): boolean => {
      const layout = gba.layoutForMap(name), split = gba.splitFor(layout);
      const primary = id < split.metatiles;
      const symbol = primary ? layout.primaryTileset : layout.secondaryTileset;
      const local = primary ? id : id - split.metatiles;
      for (const use of gbaConsumingLayouts(gba, symbol)) {
        const target = use.role === "primary" ? local : use.split.metatiles + local;
        const others = gba.mapNames().filter(other => other !== name && gba.layoutForMap(other).id === use.layout);
        if (others.length === 0) continue;
        const consumer = gba.layouts.find(candidate => candidate.id === use.layout);
        if (!consumer) throw new Error(`unknown layout ${use.layout}`);
        if (others.some(other => gbaCells(gba.layoutForMap(other).blockdataFilepath).includes(target))
          || gbaCells(consumer.borderFilepath).includes(target)) return true;
      }
      return false;
    };
    // "A block only this map uses" must actually be drawn by this map, in its grid or border.
    const gbaDrawnHere = (name: string, id: number): boolean => {
      const layout = gba.layoutForMap(name);
      return gbaCells(layout.blockdataFilepath).includes(id) || gbaCells(layout.borderFilepath).includes(id);
    };
    const findGbaConfirm = async (want: boolean) => {
      for (const name of [...gba.mapNames()].sort()) {
        for (const id of gbaCandidates(name)) {
          if (gbaConfirm(name, id) !== want) continue;
          if (!want && !gbaDrawnHere(name, id)) continue;
          const data = await block(name, `block=${id}`);
          if (data.blockId !== id) continue;
          return { name, id, data };
        }
      }
      return undefined;
    };
    const gbcMetaCache = new Map<string, string>();
    const gbcMetaFile = (name: string): string => {
      const cached = gbcMetaCache.get(name);
      if (cached) return cached;
      const path = canonicalTilesetPath(gbc.tileset(gbc.map(name).tileset).metatilesPath);
      gbcMetaCache.set(name, path);
      return path;
    };
    const gbcDrawnCache = new Map<string, Set<number>>();
    const gbcDrawn = (name: string): Set<number> => {
      const cached = gbcDrawnCache.get(name);
      if (cached) return cached;
      const map = gbc.map(name), bytes = readFileSync(resolve(root, map.blkPath));
      const ids = new Set<number>([map.border]);
      for (let i = 0; i < Math.min(bytes.length, map.width * map.height); i++) ids.add(bytes[i]!);
      gbcDrawnCache.set(name, ids);
      return ids;
    };
    const gbcOtherDrawn = (name: string, id: number): boolean =>
      gbc.maps.some(other => other.name !== name && gbcMetaFile(other.name) === gbcMetaFile(name)
        && gbcDrawn(other.name).has(id));
    const findGbcConfirm = async (want: boolean) => {
      const count = readFileSync(resolve(root, gbcMetaFile(pair.a))).length / 16;
      for (let id = 0; id < count; id++) {
        if (gbcOtherDrawn(pair.a, id) !== want) continue;
        if (!want && !gbcDrawn(pair.a).has(id)) continue;
        const data = await block(pair.a, `block=${id}`);
        if (data.blockId !== id) continue;
        return { name: pair.a, id, data };
      }
      return undefined;
    };
    const findGbaSaveAsNew = async () => {
      for (const name of [...gba.mapNames()].sort()) {
        const layout = gba.layoutForMap(name);
        if (gba.mapNames().filter(other =>
          gba.layoutForMap(other).blockdataFilepath === layout.blockdataFilepath).length > 1) continue;
        const map = await mapGet(name);
        const id = map.blocks[0]?.metatileId;
        if (typeof id !== "number") continue;
        const data = await request(`/api/edit/${encoded(name)}/block?x=0&y=0`);
        if (data.status !== 200 || data.body.blockId !== id || data.body.limits.nextId == null) continue;
        const split = gba.splitFor(layout), primary = id < split.metatiles;
        const symbol = primary ? layout.primaryTileset : layout.secondaryTileset;
        const count = gbaFileCount(symbol);
        const expected = primary ? count : split.metatiles + count;
        if (data.body.limits.nextId !== expected) continue;
        return { name, cell: { x: 0, y: 0 }, data: data.body, expected, width: map.layout.width as number,
          files: [gbaTilesetFile(symbol), canonicalTilesetPath(gba.tilesetPaths(symbol).attributesBin),
            layout.blockdataFilepath] };
      }
      return undefined;
    };
    const findGbcSaveAsNew = async () => {
      for (const name of [...gbc.maps.map(map => map.name)].sort()) {
        const map = gbc.map(name);
        if (gbc.maps.filter(other => other.blkPath === map.blkPath).length > 1) continue;
        const metaPath = gbcMetaFile(name);
        const count = readFileSync(resolve(root, metaPath)).length / 16;
        if (count >= 256) continue;
        const collisionPath = canonicalTilesetPath(gbc.tileset(map.tileset).collisionPath);
        const records = readFileSync(resolve(root, collisionPath), "utf8")
          .match(/^[ \t]*tilecoll\b.*$/gm)?.length ?? 0;
        if (records < count) continue;
        const payload = await mapGet(name), width = payload.layout.width as number;
        const index = payload.blocks.findIndex((cell: { metatileId: number }) => cell.metatileId !== 0);
        if (index < 0) continue;
        const cell = { x: index % width, y: Math.floor(index / width) };
        const data = await request(`/api/edit/${encoded(name)}/block?x=${cell.x}&y=${cell.y}`);
        if (data.status !== 200 || data.body.limits.nextId !== count) continue;
        return { name, cell, data: data.body, expected: count, width, files: [metaPath, collisionPath, map.blkPath] };
      }
      return undefined;
    };
    // The changed (not merely restored) entries a failed apply must leave untouched.
    const changedStaged = (name: string): TilesetFileEdit[] =>
      store.has(name) ? stagedEdits(name).filter(edit => !edit.after.equals(edit.before)) : [];
    const undoDepth = (name: string): number => store.has(name) ? historyLength(name) : 0;
    // The planner's G5 predicate: a changed entry whose tile resolves to a different
    // (symbol, local) in at least two layouts consuming the target tileset. Recomputed
    // from layout splits, tile PNG sizes and palettes on disk; the drafted entry is
    // changed, and every consumer's structural check is satisfied before the GET.
    const findGbaCrossHalf = async () => {
      const decode = (bytes: Buffer, index: number) => Array.from({ length: 8 }, (_, i) => {
        const word = bytes.readUInt16LE(index * 16 + i * 2);
        return { tile: word & 0x3ff, palette: word >>> 12 };
      });
      for (const symbol of [...gba.tilesetSymbols()].sort()) {
        const uses = gbaConsumingLayouts(gba, symbol);
        if (uses.length < 2) continue;
        const consumers = uses.map(use => {
          const primary = use.role === "primary" ? symbol : use.pairedWith;
          const secondary = use.role === "secondary" ? symbol : use.pairedWith;
          return {
            use, primary, secondary,
            primaryTiles: pngTiles(gba.tilesetPaths(primary).tilesPng),
            secondaryTiles: pngTiles(gba.tilesetPaths(secondary).tilesPng),
            primaryPals: gba.tileset(primary).palettes.length,
            secondaryPals: gba.tileset(secondary).palettes.length,
          };
        });
        const paletteOk = (consumer: (typeof consumers)[number], palette: number) =>
          palette < 13 && palette < (palette < consumer.use.split.pals
            ? consumer.primaryPals : consumer.secondaryPals);
        const bytes = readFileSync(resolve(root, gbaTilesetFile(symbol)));
        const count = bytes.length / 16;
        for (let tile = 0; tile <= 0x3ff; tile++) {
          const valid = consumers.every(consumer => tile < consumer.use.split.tiles
            ? tile < consumer.primaryTiles
            : tile - consumer.use.split.tiles < consumer.secondaryTiles);
          if (!valid) continue;
          const sources = consumers.map(consumer => tile < consumer.use.split.tiles
            ? { symbol: consumer.primary, local: tile }
            : { symbol: consumer.secondary, local: tile - consumer.use.split.tiles });
          if (!sources.some(source => source.symbol !== sources[0]!.symbol || source.local !== sources[0]!.local)) continue;
          for (const consumer of consumers) {
            if (consumer.use.role !== "primary") continue;
            const name = [...gba.mapNames()].sort()
              .find(map => gba.layoutForMap(map).id === consumer.use.layout);
            if (name === undefined) continue;
            const layout = gba.layoutForMap(name), split = gba.splitFor(layout);
            const blocks = Math.min(count, split.metatiles);
            for (let id = 0; id < blocks; id++) {
              const index = decode(bytes, id).findIndex(entry =>
                entry.tile !== tile && consumers.every(consumer => paletteOk(consumer, entry.palette)));
              if (index < 0) continue;
              const data = await block(name, `block=${id}`);
              if (data.blockId !== id) continue;
              return { name, id, data, tile, index };
            }
          }
        }
      }
      return undefined;
    };
    // A real other block in the same file, copied onto the subject. GBA entries must pass
    // every consuming layout's tile/palette check for the planner to accept the draft.
    const findChangedSource = async (name: string, data: any, opts: { sameLayer?: boolean } = {}) => {
      const id = data.blockId as number;
      if (family === "gbc") {
        const count = readFileSync(resolve(root, gbcMetaFile(name))).length / 16;
        const suffix = "?time=day";
        const reference = await png(`/api/metatile/${encoded(name)}/${id}.png${suffix}`);
        // A broken candidate image is skipped, never treated as a fixture failure.
        const image = async (other: number) => {
          try { return await png(`/api/metatile/${encoded(name)}/${other}.png${suffix}`); }
          catch { return undefined; }
        };
        for (let other = 0; other < count; other++) {
          if (other === id) continue;
          const source = await block(name, `block=${other}`);
          if (source.blockId !== other) continue;
          if (JSON.stringify(source.block.tiles) === JSON.stringify(data.block.tiles)) continue;
          const candidate = await image(other);
          if (!candidate || candidate.equals(reference)) continue;
          return { id: other, data: source, png: candidate };
        }
        return undefined;
      }
      const layout = gba.layoutForMap(name), split = gba.splitFor(layout);
      const primary = id < split.metatiles;
      const symbol = primary ? layout.primaryTileset : layout.secondaryTileset;
      const bytes = readFileSync(resolve(root, gbaTilesetFile(symbol)));
      const count = bytes.length / 16;
      const attrPath = canonicalTilesetPath(gba.tilesetPaths(symbol).attributesBin);
      const attributes = readFileSync(resolve(root, attrPath));
      const size = gba.profile.metatileAttributesSize;
      const layer = (index: number) => attributes.readUIntLE(index * size, size) & gba.profile.metatileLayerTypeMask;
      const consumers = gbaConsumingLayouts(gba, symbol).map(use => {
        const first = use.role === "primary" ? symbol : use.pairedWith;
        const second = use.role === "secondary" ? symbol : use.pairedWith;
        return {
          use,
          primaryTiles: pngTiles(gba.tilesetPaths(first).tilesPng),
          secondaryTiles: pngTiles(gba.tilesetPaths(second).tilesPng),
          primaryPals: gba.tileset(first).palettes.length,
          secondaryPals: gba.tileset(second).palettes.length,
        };
      });
      const entryOk = (consumer: (typeof consumers)[number], entry: { tile: number; palette: number }) => {
        const tileOk = entry.tile < consumer.use.split.tiles
          ? entry.tile < consumer.primaryTiles
          : entry.tile - consumer.use.split.tiles < consumer.secondaryTiles;
        const pals = entry.palette < consumer.use.split.pals ? consumer.primaryPals : consumer.secondaryPals;
        return tileOk && entry.palette < 13 && entry.palette < pals;
      };
      const decode = (index: number) => Array.from({ length: 8 }, (_, i) => {
        const word = bytes.readUInt16LE(index * 16 + i * 2);
        return {
          tile: word & 0x3ff, xFlip: (word & 0x400) !== 0,
          yFlip: (word & 0x800) !== 0, palette: word >>> 12,
        };
      });
      const same = (a: { tile: number; palette: number; xFlip: boolean; yFlip: boolean },
        b: { tile: number; palette: number; xFlip: boolean; yFlip: boolean }) =>
        a.tile === b.tile && a.palette === b.palette && a.xFlip === b.xFlip && a.yFlip === b.yFlip;
      const local = primary ? id : id - split.metatiles;
      const original = decode(local);
      // Only ids the subject's layout can address are candidates (file excess is not a block here).
      const blocks = primary
        ? Math.min(count, split.metatiles)
        : Math.min(count, gba.constants.metatilesTotal - split.metatiles);
      const reference = await png(`/api/metatile/${encoded(layout.name)}/${id}.png`);
      const image = async (other: number) => {
        try { return await png(`/api/metatile/${encoded(layout.name)}/${primary ? other : split.metatiles + other}.png`); }
        catch { return undefined; }
      };
      for (let other = 0; other < blocks; other++) {
        if (other === local) continue;
        if (opts.sameLayer && layer(other) !== layer(local)) continue;
        if (!decode(other).every((entry, index) => same(entry, original[index]!)
          || consumers.every(consumer => entryOk(consumer, entry)))) continue;
        const candidate = await image(other);
        if (!candidate || candidate.equals(reference)) continue;
        const blockId = primary ? other : split.metatiles + other;
        const source = await block(name, `block=${blockId}`);
        if (source.blockId !== blockId) continue;
        return { id: blockId, data: source, png: candidate };
      }
      return undefined;
    };
    // A file block this map never draws: editing it changes the revision but not the render.
    const findUnusedBlock = async (name: string) => {
      const map = await mapGet(name);
      const used = new Set<number>(map.blocks.map((cell: { metatileId: number }) => cell.metatileId));
      let path: string;
      if (family === "gba") {
        const layout = gba.layoutForMap(name);
        for (const id of gbaCells(layout.borderFilepath)) used.add(id);
        path = gbaTilesetFile(layout.primaryTileset);
      } else {
        used.add(map.map.border);
        path = gbcMetaFile(name);
      }
      const count = readFileSync(resolve(root, path)).length / 16;
      for (let id = 0; id < count; id++) if (!used.has(id)) return { id, path };
      return undefined;
    };
    const lastLabel = (name: string): string =>
      (store.open(name).stack as unknown as { undoStack: { label: string }[] }).undoStack.at(-1)!.label;
    // Plan 14.2 fix hop A: every session reply now also carries the map's effective metatile counts
    // (`sendSession`'s `primaryCount`/`secondaryCount`, `sessionBody`'s `metatileCount`), so the
    // palette follows a block the editor appended. The key list stays EXACT -- it just grew by them.
    const expectSessionBody = (body: any) => {
      expect(Object.keys(body).sort()).toEqual((family === "gba"
        ? ["blocks", "border", "canRedo", "canUndo", "isDirty", "map", "primaryCount", "secondaryCount", "tilesetVersion"]
        : ["blocks", "canRedo", "canUndo", "events", "isDirty", "metatileCount", "tilesetVersion"]));
      expect(typeof body.tilesetVersion).toBe("number");
      expect(Array.isArray(body.blocks)).toBe(true);
      expect(typeof body.isDirty).toBe("boolean");
      expect(typeof body.canUndo).toBe("boolean");
      expect(typeof body.canRedo).toBe("boolean");
      if (family === "gba") {
        expect(Array.isArray(body.border)).toBe(true);
        expect(body.map).toBeTruthy();
        expect(Number.isInteger(body.primaryCount)).toBe(true);
        expect(Number.isInteger(body.secondaryCount)).toBe(true);
      } else {
        expect(body.events === null || typeof body.events === "object").toBe(true);
        expect(Number.isInteger(body.metatileCount)).toBe(true);
      }
    };
    const cellQuery = (cell: { x: number; y: number }) => `x=${cell.x}&y=${cell.y}`;
    // GET-shaped request for check/apply, with a deep copy of the draft to mutate.
    const draftRequest = (data: any): any => ({
      request: family === "gba"
        ? { metatileId: data.blockId, mode: "ok", from: "palette", draft: {
          entries: data.block.entries.map((entry: Record<string, unknown>) => ({ ...entry })),
          behavior: data.block.behavior, layerType: data.block.layerType,
        } }
        : { blockId: data.blockId, mode: "ok", from: "palette", draft: {
          tiles: [...data.block.tiles], collision: [...data.block.collision], palettes: [],
        } },
      revision: data.revision as string,
    });
    // Copying another block: same request shape, the source's content, the subject's revision.
    // `source` is a `findChangedSource` result: `{ id, data: <GET body of the source block>, png }`.
    const copiedRequest = (data: any, source: any): any => {
      const body = draftRequest(data);
      const from = source.data.block;
      if (family === "gba") {
        body.request.draft = {
          entries: from.entries.map((entry: Record<string, unknown>) => ({ ...entry })),
          behavior: from.behavior, layerType: from.layerType,
        };
      } else {
        body.request.draft = {
          tiles: [...from.tiles], collision: [...from.collision], palettes: [],
        };
      }
      return body;
    };

    beforeAll(async () => {
      root = (family === "gba" ? copyGbaTilesetProject() : copyGbcSubjectToTemp()).replace(/\\/g, "/");
      const groups = new Map<string, string[]>();
      if (family === "gba") {
        gba = openProject(root);
        for (const name of gba.mapNames()) {
          const layout = gba.layoutForMap(name);
          const path = canonicalTilesetPath(gba.tilesetPaths(layout.primaryTileset).metatilesBin);
          groups.set(path, [...(groups.get(path) ?? []), name]);
        }
      } else {
        gbc = openGbcProject(root);
        for (const map of gbc.maps) {
          const path = canonicalTilesetPath(gbc.tileset(map.tileset).metatilesPath);
          groups.set(path, [...(groups.get(path) ?? []), map.name]);
        }
      }
      const match = [...groups].sort(([a], [b]) => a.localeCompare(b)).find(([path, names]) => {
        if (names.length < 2) return false;
        if (family === "gbc") return gbcSheetTiles(names[0]!) > 0x60;
        const split = gba.splitFor(gba.layoutForMap(names[0]!)).metatiles;
        const count = readFileSync(resolve(root, path)).length / 16;
        if (count >= split) return false;
        return gba.mapNames().every(name => {
          const layout = gba.layoutForMap(name);
          const current = gba.splitFor(layout).metatiles;
          const primary = canonicalTilesetPath(gba.tilesetPaths(layout.primaryTileset).metatilesBin);
          const secondary = canonicalTilesetPath(gba.tilesetPaths(layout.secondaryTileset).metatilesBin);
          return (primary !== path || current === split)
            && (secondary !== path || gba.constants.metatilesTotal - current === split);
        });
      });
      if (!match) throw new Error("fixture needs two maps sharing a metatile file (GBC: a sheet over 0x60 tiles)");
      const [path, names] = match;
      pair = { a: names[0]!, b: names[1]!, path };
      if (family === "gba") {
        const grid = gba.layoutForMap(pair.a).blockdataFilepath;
        other = gba.mapNames().find(name => gba.layoutForMap(name).blockdataFilepath !== grid)!;
        if (!other) throw new Error("fixture needs another grid");
        const factory = gbaSessions.createEditSessionStore;
        vi.spyOn(gbaSessions, "createEditSessionStore").mockImplementation(project => (store = factory(project)));
        server = createServer(createProjectHandler(root).handle);
      } else {
        const grid = gbc.map(pair.a).blkPath;
        other = gbc.maps.find(map => map.blkPath !== grid)?.name!;
        if (!other) throw new Error("fixture needs another grid");
        const collisions = new Set(gbc.maps.map(map => gbc.tileset(map.tileset))
          .filter(ts => canonicalTilesetPath(ts.metatilesPath) === path)
          .map(ts => resolve(root, ts.collisionPath)));
        restoreCollisions = restoreBytes([...collisions]);
        for (const collision of collisions) {
          const text = readFileSync(collision, "utf8");
          const last = text.match(/^[ \t]*tilecoll\b.*$/gm)?.at(-1);
          if (!last) throw new Error(`no tilecoll in ${collision}`);
          writeFileSync(collision, `${text.replace(/\s*$/, "\n")}${`${last}\n`.repeat(4)}`);
        }
        gbc = openGbcProject(root);
        const factory = gbcSessions.createGbcEditSessionStore;
        vi.spyOn(gbcSessions, "createGbcEditSessionStore").mockImplementation(project => (store = factory(project)));
        server = createServer(createGbcProjectHandler(root).handle);
      }
      // 11b fixture scans run seconds of synchronous disk work between requests; Node's default 5 s keep-alive
      // closes the idle socket while fetch reuses it (ECONNRESET seen in s10's red run).
      server.keepAliveTimeout = 120_000;
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }, 120_000);
    afterEach(() => store.closeAll());
    afterAll(async () => {
      try { if (server) await new Promise<void>(done => server.close(() => done())); }
      finally {
        try { restoreCollisions?.(); }
        finally {
          vi.restoreAllMocks();
          if (root) (family === "gba" ? removeGbaTemp : removeTemp)(root);
        }
      }
    });

    it("1 and 5: resolves id and cell, family shape, disk bytes and limits", async () => {
      const map = await mapGet(pair.a);
      const id = await idFor();
      const byId = await block(pair.a, `block=${id}`);
      expect(byId.blockId).toBe(id);
      expect(byId.viaBorder).toBe(false);
      expect(byId.revision).toEqual(expect.any(String));
      expect(byId.revision.length).toBeGreaterThan(0);
      const cellIndex = map.blocks.findIndex((cell: { metatileId: number }) =>
        family === "gba" || cell.metatileId !== 0);
      if (cellIndex < 0) throw new Error("fixture needs a nonzero GBC cell");
      const cellId = map.blocks[cellIndex].metatileId;
      const width = map.layout.width as number;
      const byCell = await block(pair.a, `x=${cellIndex % width}&y=${Math.floor(cellIndex / width)}`);
      expect(byCell.blockId).toBe(cellId);
      expect(byCell.viaBorder).toBe(false);
      const count = readFileSync(resolve(root, pair.path)).length / 16;
      if (family === "gba") {
        expect(byId.block.entries).toHaveLength(8);
        expect(typeof byId.block.behavior).toBe("number");
        expect(typeof byId.block.layerType).toBe("number");
        expect(count).toBe(map.primaryCount);
        expect(byId.limits).toEqual({ nextId: count < map.split.metatiles ? count : null, cap: map.split.metatiles });
      } else {
        expect(byId.block.tiles).toEqual([...readFileSync(resolve(root, pair.path)).subarray(id * 16, id * 16 + 16)]);
        expect(byId.block.collision).toHaveLength(4);
        expect(byId.block.collision.every((value: unknown) => typeof value === "string")).toBe(true);
        expect(byId.block.tilePalettes).toHaveLength(16);
        expect(byId.block.tilePalettes.every((value: unknown) => typeof value === "string")).toBe(true);
        expect(byId.limits).toEqual({ nextId: count < 256 ? count : null, cap: 256 });
      }
    });

    if (family === "gbc") it("2: a raw zero cell resolves to the map border", async () => {
      const map = await mapGet(pair.a);
      const painted = await paint(pair.a, 0);
      expect(painted.blocks[0].metatileId).toBe(0);
      const result = await block(pair.a, "x=0&y=0");
      expect(result.blockId).toBe(map.map.border);
      expect(result.viaBorder).toBe(true);
    });

    it("3: revision follows this grid and staged bytes, not another grid", async () => {
      const id = await idFor();
      const first = await block(pair.a, `block=${id}`);
      const mapOther = await mapGet(other);
      const oldOther = mapOther.blocks[0].metatileId;
      await paint(other, oldOther === 0 ? 1 : 0);
      expect((await block(pair.a, `block=${id}`)).revision).toBe(first.revision);
      const map = await mapGet(pair.a);
      const old = map.blocks[0].metatileId;
      await paint(pair.a, old === 0 ? 1 : 0);
      const painted = await block(pair.a, `block=${id}`);
      expect(painted.revision).not.toBe(first.revision);
      stage(pair.a);
      expect((await block(pair.a, `block=${id}`)).revision).not.toBe(painted.revision);
    });

    it("3: staged replacement is returned as block content", async () => {
      const id = await idFor();
      const before = readFileSync(resolve(root, pair.path));
      const original = before.subarray(id * 16, id * 16 + 16);
      const otherId = Array.from({ length: before.length / 16 }, (_, i) => i)
        .find(i => !before.subarray(i * 16, i * 16 + 16).equals(original));
      if (otherId === undefined) throw new Error("fixture needs two different metatiles");
      const replacement = Buffer.from(before.subarray(otherId * 16, otherId * 16 + 16));
      const after = Buffer.from(before);
      replacement.copy(after, id * 16);
      const edits: TilesetFileEdit[] = [{ path: pair.path, before, after }];
      if (family === "gbc") {
        const paths = new Set(gbc.maps.map(map => gbc.tileset(map.tileset))
          .filter(ts => canonicalTilesetPath(ts.metatilesPath) === pair.path)
          .map(ts => canonicalTilesetPath(ts.collisionPath)));
        for (const path of paths) {
          const collision = readFileSync(resolve(root, path));
          edits.push({ path, before: collision, after: Buffer.from(collision) });
        }
      }
      try {
        stageTilesetPlan(store, pair.a, buildPlan(edits), "content oracle");
        const result = await block(pair.a, `block=${id}`);
        if (family === "gba") {
          const entries = Array.from({ length: 8 }, (_, i) => {
            const value = replacement.readUInt16LE(i * 2);
            return {
              tile: value & 0x3ff, xFlip: !!(value & 0x400),
              yFlip: !!(value & 0x800), palette: value >>> 12,
            };
          });
          expect(result.block.entries).toEqual(entries);
        } else {
          expect(result.block.tiles).toEqual([...replacement]);
        }
      } finally { store.closeAll(); }
    });

    it("5: file cap reflects every consumer and rejects an append at capacity", async () => {
      if (family === "gba") {
        const uses = new Map<string, { name: string; cap: number }[]>();
        for (const layout of gba.layouts) {
          const split = gba.splitFor(layout).metatiles;
          for (const [symbol, cap] of [
            [layout.primaryTileset, split],
            [layout.secondaryTileset, gba.constants.metatilesTotal - split],
          ] as const) {
            const path = canonicalTilesetPath(gba.tilesetPaths(symbol).metatilesBin);
            uses.set(path, [...(uses.get(path) ?? []), { name: layout.id, cap }]);
          }
        }
        const candidate = [...uses].flatMap(([path, consumers]) => {
          const minimum = Math.min(...consumers.map(use => use.cap));
          return gba.mapNames().flatMap(name => {
            const layout = gba.layoutForMap(name);
            const primary = canonicalTilesetPath(gba.tilesetPaths(layout.primaryTileset).metatilesBin);
            return primary === path && gba.splitFor(layout).metatiles > minimum
              ? [{ path, name, minimum }] : [];
          });
        })[0];
        const name = candidate?.name ?? pair.a;
        const path = candidate?.path ?? pair.path;
        const minimum = candidate?.minimum ?? Math.min(...uses.get(path)!.map(use => use.cap));
        const result = await block(name, "block=0");
        expect(result.limits.cap).toBe(minimum);
        const count = readFileSync(resolve(root, path)).length / 16;
        if (count >= minimum) expect(result.limits.nextId).toBeNull();
        else expect(result.limits.nextId).toBe(count);
      } else {
        const before = readFileSync(resolve(root, pair.path));
        const count = before.length / 16;
        if (count > 256) throw new Error("fixture exceeds GBC block cap");
        const after = Buffer.concat([before, ...Array.from({ length: 256 - count }, () => before.subarray(0, 16))]);
        const edits: TilesetFileEdit[] = [{ path: pair.path, before, after }];
        const paths = new Set(gbc.maps.map(map => gbc.tileset(map.tileset))
          .filter(ts => canonicalTilesetPath(ts.metatilesPath) === pair.path)
          .map(ts => canonicalTilesetPath(ts.collisionPath)));
        for (const path of paths) {
          const bytes = readFileSync(resolve(root, path));
          const text = bytes.toString("utf8");
          const lines = text.match(/^[ \t]*tilecoll\b.*$/gm) ?? [];
          const last = lines.at(-1);
          if (!last) throw new Error(`no tilecoll in ${path}`);
          edits.push({ path, before: bytes, after: Buffer.from(
            `${text.replace(/\s*$/, "\n")}${`${last}\n`.repeat(Math.max(0, 256 - lines.length))}`,
          ) });
        }
        try {
          stageTilesetPlan(store, pair.a, buildPlan(edits), "cap oracle");
          expect((await block(pair.a, "block=0")).limits).toEqual({ nextId: null, cap: 256 });
        } finally { store.closeAll(); }
      }
    });

    it("4 and 9: reports ownership and Save effects for the staged file", async () => {
      const id = await idFor();
      expect((await block(pair.a, `block=${id}`)).owner).toBeNull();
      expect((await edit(pair.b, "plan")).tilesetEffects).toEqual([]);
      const plan = appendPlan();
      const restore = restoreBytes(plan.edits.map(e => resolve(root, e.path)));
      try {
        stageTilesetPlan(store, pair.b, plan, "read oracle");
        expect((await block(pair.a, `block=${id}`)).owner).toBe(pair.b);
        const effects = (await edit(pair.b, "plan")).tilesetEffects as { path: string; maps: string[] }[];
        const effect = effects.find(item => item.path === plan.edits[0]!.path);
        expect(effect).toBeDefined();
        expect(effect!.maps).toContain(pair.b);
        expect(effect!.maps).toContain(pair.a);
      } finally { restore(); }
    });

    it("6: sheet dimensions, tile ids, palette/time parameters and cache version", async () => {
      const id = await idFor();
      const versionBefore = (await mapGet(pair.a)).tilesetVersion;
      const sheet = (await block(pair.a, `block=${id}`)).sheet;
      expect(new URL(sheet.url, base).searchParams.get("tv")).toBe(String(versionBefore));
      expect(sheet.url).toContain("tv=");
      if (family === "gbc") {
        expect(sheet.url).toContain("time=");
        expect(new URL(sheet.url, base).searchParams.get("time")).toBe("day");
      }
      expect(sheet.tileIds).toHaveLength(sheet.tileCount);
      const first = await png(sheet.url + (family === "gba" ? "&pal=0" : ""));
      expect(dimensions(first)).toEqual({ width: 128, height: 8 * Math.ceil(sheet.tileCount / 16) });
      if (family === "gba") {
        // B7: sheet index i is tile id i; ids between the primary tiles and the split are not tiles (null).
        const { primary, secondary, split } = gbaSheetTiles(pair.a);
        expect(sheet.tileCount).toBe(split + secondary);
        expect(sheet.tileIds).toEqual(Array.from({ length: split + secondary }, (_, i) =>
          (i < primary || i >= split ? i : null)));
        expect(await png(sheet.url + "&pal=1")).not.toEqual(first);
      } else {
        expect(sheet.tileCount).toBe(gbcSheetTiles(pair.a));
        expect(sheet.tileCount, "sheet must include index 0x60").toBeGreaterThan(0x60);
        expect(sheet.tileIds[0x60]).toBe(0x80);
      }
      try {
        stage(pair.a);
        const versionAfter = (await mapGet(pair.a)).tilesetVersion;
        const stagedSheet = (await block(pair.a, `block=${id}`)).sheet;
        expect(versionAfter).not.toBe(versionBefore);
        expect(new URL(stagedSheet.url, base).searchParams.get("tv")).toBe(String(versionAfter));
      } finally { store.closeAll(); }
    });

    if (family === "gbc") it("6: sheet follows the requested time palette", async () => {
      let selected: string | undefined;
      for (const map of gbc.maps) {
        const path = `/api/render/${encoded(map.name)}.png`;
        const day = await png(`${path}?time=day`);
        const night = await png(`${path}?time=nite`);
        if (!day.equals(night)) { selected = map.name; break; }
      }
      if (!selected) throw new Error("fixture needs a GBC map with different day and nite renders");
      const day = await ok(`/api/edit/${encoded(selected)}/block?block=0&time=day`);
      const night = await ok(`/api/edit/${encoded(selected)}/block?block=0&time=nite`);
      expect(new URL(day.sheet.url, base).searchParams.get("time")).toBe("day");
      expect(new URL(night.sheet.url, base).searchParams.get("time")).toBe("nite");
      expect(await png(day.sheet.url)).not.toEqual(await png(night.sheet.url));
    }, 120_000);

    // Conductor s10 (mutation M15): each sheet cell is drawn in its tile's palette-map palette. Oracle: the top-left
    // 8x8 of the hub's metatile image (same map, same time); the palette map only selects blocks whose tile is not
    // palette 0, so a sheet drawn in one palette cannot pass.
    if (family === "gbc") it("6: sheet cells use each tile's palette-map palette", async () => {
      const ts = gbc.tileset(gbc.map(pair.a).tileset);
      const data = await block(pair.a, `block=${await idFor()}`);
      const sheetPng = await png(data.sheet.url);
      const sheet = pixels(sheetPng);
      const sheetWidth = dimensions(sheetPng).width;
      const blocks = readFileSync(resolve(root, pair.path));
      let checked = 0;
      for (let id = 0; id < blocks.length / 16 && checked < 3; id++) {
        const tile = blocks[id * 16]!;
        if (!ts.palMap[tile] || ts.palMap[tile]!.pal === 0) continue;
        const index = data.sheet.tileIds.indexOf(tile);
        if (index < 0) continue;
        const metaPng = await png(`/api/metatile/${encoded(pair.a)}/${id}.png?time=day`);
        expect(dimensions(metaPng)).toEqual({ width: 32, height: 32 });
        const meta = pixels(metaPng);
        const x0 = (index % 16) * 8, y0 = Math.floor(index / 16) * 8;
        for (let y = 0; y < 8; y++) {
          const cell = sheet.subarray(((y0 + y) * sheetWidth + x0) * 4, ((y0 + y) * sheetWidth + x0 + 8) * 4);
          expect(cell, `block ${id} tile ${tile} row ${y}`).toEqual(meta.subarray(y * 32 * 4, (y * 32 + 8) * 4));
        }
        checked++;
      }
      if (checked === 0) throw new Error("fixture needs a block whose top-left tile uses a palette other than 0");
    }, 120_000);

    it("7: changed draft renders the other metatile", async () => {
      const name = pair.a;
      const map = await mapGet(name);
      const before = readFileSync(resolve(root, pair.path));
      const a = await idFor();
      const referenceName = family === "gba" ? map.layout.name : name;
      const suffix = family === "gbc" ? "?time=day" : "";
      const imageA = await png(`/api/metatile/${encoded(referenceName)}/${a}.png${suffix}`);
      const attributes = family === "gba" ? readFileSync(resolve(root,
        gba.tilesetPaths(gba.layoutForMap(name).primaryTileset).attributesBin)) : undefined;
      const attributeSize = family === "gba" ? gba.profile.metatileAttributesSize : 0;
      const layer = (index: number) => attributes!.readUIntLE(index * attributeSize, attributeSize)
        & gba.profile.metatileLayerTypeMask;
      let b = -1;
      let reference: Buffer | undefined;
      for (let candidate = 0; candidate < before.length / 16; candidate++) {
        if (candidate === a) continue;
        if (attributes && layer(candidate) !== layer(a)) continue;
        const image = await png(`/api/metatile/${encoded(referenceName)}/${candidate}.png${suffix}`);
        if (!image.equals(imageA)) { b = candidate; reference = image; break; }
      }
      if (b < 0) throw new Error("fixture needs two visibly different metatiles in the same tileset");
      const draft = await block(name, `block=${b}`);
      const preview = await edit(name, `block/preview${suffix}`, identity(a, draft));
      expect(Buffer.from(preview.png, "base64")).toEqual(reference);
    }, 120_000);

    it("7: identity preview matches a context-sensitive hub image and rejects an invalid tile", async () => {
      let name = pair.a;
      let id = -1;
      let reference: Buffer | undefined;
      if (family === "gba") {
        const map = await mapGet(name);
        // Secondary blocks: primary `building` draws everything with palette 0. A block drawn with a nonzero
        // palette makes a preview that ignores the map's palettes differ.
        const layout = gba.layoutForMap(name);
        const split = gba.splitFor(layout).metatiles;
        const metatiles = readFileSync(resolve(root, gba.tilesetPaths(layout.secondaryTileset).metatilesBin));
        for (let local = 0; local < metatiles.length / 16; local++) {
          const candidate = split + local;
          const entries = metatiles.subarray(local * 16, local * 16 + 16);
          let paletted = false;
          for (let k = 0; k < 16; k += 2) if (entries.readUInt16LE(k) >> 12 !== 0) paletted = true;
          if (!paletted) continue;
          const image = await png(`/api/metatile/${encoded(map.layout.name)}/${candidate}.png`);
          const rgba = pixels(image);
          const colors = new Set<string>();
          for (let offset = 0; offset < rgba.length; offset += 4) {
            colors.add(rgba.subarray(offset, offset + 4).toString("hex"));
          }
          if (colors.size < 2) continue;
          id = candidate; reference = image; break;
        }
        if (id < 0) throw new Error("fixture needs a visible, nonuniform GBA metatile with a nonzero palette");
      } else {
        for (const map of gbc.maps) {
          const mapBody = await mapGet(map.name);
          const ids = [...new Set<number>(mapBody.blocks.map((cell: { metatileId: number }) => cell.metatileId))]
            .filter(candidate => candidate > 0).slice(0, 8);
          for (const candidate of ids) {
            const path = `/api/metatile/${encoded(map.name)}/${candidate}.png`;
            const day = await png(`${path}?time=day`);
            const night = await png(`${path}?time=nite`);
            if (pixels(day).equals(pixels(night))) continue;
            name = map.name; id = candidate; reference = night; break;
          }
          if (id >= 0) break;
        }
        if (id < 0) throw new Error("fixture needs a GBC metatile whose day and night pixels differ");
      }
      const data = await block(name, `block=${id}`);
      const body = identity(id, data);
      const preview = await edit(name, `block/preview${family === "gbc" ? "?time=nite" : ""}`, body);
      expect(typeof preview.png).toBe("string");
      expect(Buffer.from(preview.png, "base64")).toEqual(reference);
      let invalidName = name;
      let invalidBody = body;
      if (family === "gba") {
        // A layout whose tiles fill all 1024 ids has no representable tile outside its sheet: use the first map (by
        // name) whose sheet has a gap, from the tile PNGs on disk.
        const gap = (map: string) => {
          const { primary, secondary, split } = gbaSheetTiles(map);
          const missing = primary < split ? primary : split + secondary;
          return missing <= 0x3ff ? missing : undefined;
        };
        invalidName = [...gba.mapNames()].sort().find(map => gap(map) !== undefined)!;
        if (invalidName === undefined) throw new Error("fixture needs a representable GBA tile id outside the sheet");
        invalidBody = identity(0, await block(invalidName, "block=0"));
        invalidBody.request.draft.entries[0].tile = gap(invalidName)!;
      } else {
        expect(data.sheet.tileIds).not.toContain(0x60);
        body.request.draft.tiles[0] = 0x60;
      }
      const invalid = await request(`/api/edit/${encoded(invalidName)}/block/preview`, invalidBody);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toContain(family === "gba" ? "entries" : "tiles");
      expect(typeof invalid.body.code).toBe("string");
    }, 120_000);

    it("8: reads do not open a session or alter an open session and undo depth", async () => {
      const id = await idFor();
      expect(store.has(pair.a)).toBe(false);
      const read = async () => {
        const data = await block(pair.a, `block=${id}`);
        await png(data.sheet.url);
        await edit(pair.a, "block/preview", identity(id, data));
      };
      await read();
      expect(store.has(pair.a)).toBe(false);
      const map = await mapGet(pair.a);
      const initial = map.blocks[0].metatileId;
      await paint(pair.a, initial === 0 ? 1 : 0);
      const before = JSON.stringify(await edit(pair.a, "paint/end", {}));
      const depth = historyLength(pair.a);
      await read();
      expect(JSON.stringify(await edit(pair.a, "paint/end", {}))).toBe(before);
      expect(historyLength(pair.a)).toBe(depth);
    });

    const checkDraft = async (field: string, value: unknown) => {
      const id = await idFor();
      const data = await block(pair.a, `block=${id}`);
      const body = identity(id, data);
      body.request.draft = { ...body.request.draft, [field]: value };
      const result = await request(`/api/edit/${encoded(pair.a)}/block/preview`, body);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("BAD_VALUE");
      expect(result.body.error).toMatch(new RegExp(`^draft\\.${field}`));
    };

    if (family === "gba") {
      it.each([
        ["behavior", "overflow"], ["behavior", "above mask"],
        ["layerType", "overflow"], ["layerType", "above mask"],
      ])("10: rejects draft.%s %s", async (field, boundary) => {
        const mask = gba.profile.metatileLayerTypeMask >>> 0;
        const shift = 31 - Math.clz32((mask & -mask) >>> 0);
        const limit = field === "behavior" ? gba.profile.metatileBehaviorMask : mask >>> shift;
        await checkDraft(field, boundary === "overflow" ? 2 ** 32 : limit + 1);
      });

      it("10: layer options match the project's C enum", async () => {
        const data = await block(pair.a, `block=${await idFor()}`);
        const header = readFileSync(resolve(root, "include/global.fieldmap.h"), "utf8");
        const enumBody = header.match(/enum\s*(?:\w+\s*)?\{([^}]*METATILE_LAYER_TYPE_[^}]*)\}/s)?.[1];
        if (!enumBody) throw new Error("fixture needs METATILE_LAYER_TYPE enum");
        let next = 0;
        const layers: { name: string; value: number }[] = [];
        const withoutComments = enumBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
        for (const part of withoutComments.split(",")) {
          const member = part.trim().match(/^(\w+)(?:\s*=\s*(0x[\da-f]+|\d+))?/i);
          if (!member) continue;
          if (member[2] !== undefined) next = Number(member[2]);
          if (member[1]!.startsWith("METATILE_LAYER_TYPE_")) {
            layers.push({ name: member[1]!.slice("METATILE_LAYER_TYPE_".length), value: next });
          }
          next++;
        }
        expect(layers.length).toBeGreaterThan(0);
        expect(data.options.layerTypes).toEqual(layers.sort((a, b) => a.value - b.value));
      });

      // B15a: a layer-type enum member whose initializer cannot be read is skipped and the GET stays 200. The header
      // written here is the source of every expectation; the original header is restored in finally.
      it("B15a: unreadable layer member is skipped, GET stays 200", async () => {
        const headerPath = resolve(root, "include/global.fieldmap.h");
        const restore = restoreBytes([headerPath]);
        const id = await idFor();
        try {
          writeFileSync(headerPath, [
            "#ifndef GUARD_GLOBAL_FIELDMAP_H",
            "#define GUARD_GLOBAL_FIELDMAP_H",
            "enum MetatileLayerType {",
            "    METATILE_LAYER_TYPE_NORMAL = 0,",
            "    METATILE_LAYER_TYPE_COVERED,",
            "    METATILE_LAYER_TYPE_SPLIT = 1 << 3,",
            "};",
            "#endif // GUARD_GLOBAL_FIELDMAP_H",
            "",
          ].join("\n"));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.layerTypes).toEqual([
            { name: "NORMAL", value: 0 },
            { name: "COVERED", value: 1 },
          ]);
        } finally { restore(); }
      });

      // Replaces the enum block in the header with `enumBlock`; everything else in the file is kept.
      const replaceLayerEnum = (header: string, enumBlock: string) => {
        const pattern = /enum\s*(?:\w+\s*)?\{[^}]*METATILE_LAYER_TYPE_[^}]*\}/s;
        if (!pattern.test(header)) throw new Error("fixture needs METATILE_LAYER_TYPE enum in include/global.fieldmap.h");
        return header.replace(pattern, enumBlock);
      };
      const layerHeader = (rootPath: string, enumBlock: string) => {
        const headerPath = resolve(rootPath, "include/global.fieldmap.h");
        const header = readFileSync(headerPath, "utf8");
        return { headerPath, next: replaceLayerEnum(header, enumBlock) };
      };

      // The rewritten enum keeps the rest of the header; literals only, no route parsing.
      it("B14c': layer enum literal offset carries to successors", async () => {
        const { headerPath, next } = layerHeader(root, [
          "enum MetatileLayerType {",
          "    METATILE_LAYER_TYPE_NORMAL,",
          "    METATILE_LAYER_TYPE_COVERED = 4,",
          "    METATILE_LAYER_TYPE_SPLIT,",
          "};",
        ].join("\n"));
        const restore = restoreBytes([headerPath]);
        const id = await idFor();
        try {
          writeFileSync(headerPath, next);
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.layerTypes).toEqual([
            { name: "NORMAL", value: 0 },
            { name: "COVERED", value: 4 },
            { name: "SPLIT", value: 5 },
          ]);
        } finally { restore(); }
      });

      // An unreadable initializer drops its member and every implicit successor up to the next literal.
      it("B15a: unreadable member skips successors until the next literal", async () => {
        const { headerPath, next } = layerHeader(root, [
          "enum MetatileLayerType {",
          "    METATILE_LAYER_TYPE_NORMAL,",
          "    METATILE_LAYER_TYPE_COVERED = 1 << 1,",
          "    METATILE_LAYER_TYPE_SPLIT,",
          "    METATILE_LAYER_TYPE_TOP = 7,",
          "};",
        ].join("\n"));
        const restore = restoreBytes([headerPath]);
        const id = await idFor();
        try {
          writeFileSync(headerPath, next);
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.layerTypes).toEqual([
            { name: "NORMAL", value: 0 },
            { name: "TOP", value: 7 },
          ]);
        } finally { restore(); }
      });

      // No enum member and no define leaves nothing readable: fall back to 0/1/2.
      it("B15a: no readable layer values fall back to NORMAL/COVERED/SPLIT 0/1/2", async () => {
        const headerPath = resolve(root, "include/global.fieldmap.h");
        const header = readFileSync(headerPath, "utf8");
        if (!header.includes("METATILE_LAYER_TYPE_")) {
          throw new Error("fixture needs METATILE_LAYER_TYPE_ occurrences in include/global.fieldmap.h");
        }
        const restore = restoreBytes([headerPath]);
        const id = await idFor();
        try {
          writeFileSync(headerPath, header.split("METATILE_LAYER_TYPE_").join(""));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.layerTypes).toEqual([
            { name: "NORMAL", value: 0 },
            { name: "COVERED", value: 1 },
            { name: "SPLIT", value: 2 },
          ]);
        } finally { restore(); }
      });

      // A define still wins over the enum value for the same member.
      it("B15a: #define overrides an enum value", async () => {
        const headerPath = resolve(root, "include/global.fieldmap.h");
        const header = readFileSync(headerPath, "utf8");
        const restore = restoreBytes([headerPath]);
        const id = await idFor();
        try {
          writeFileSync(headerPath, `${header}\n#define METATILE_LAYER_TYPE_SPLIT 9\n`);
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.layerTypes).toEqual([
            { name: "NORMAL", value: 0 },
            { name: "COVERED", value: 1 },
            { name: "SPLIT", value: 9 },
          ]);
        } finally { restore(); }
      });

      // Names keep the full MB_ prefix; the define after the enum is read as well.
      it("B15b: behaviors are read from a C enum", async () => {
        const behaviorsPath = resolve(root, "include/constants/metatile_behaviors.h");
        const restore = restoreBytes([behaviorsPath]);
        const id = await idFor();
        try {
          const before = await block(pair.a, `block=${id}`);
          expect(before.options.behaviors.length, "untouched behaviors must be non-empty").toBeGreaterThan(0);
          for (const behavior of before.options.behaviors) {
            expect(behavior.name.startsWith("MB_"), JSON.stringify(behavior)).toBe(true);
          }
          writeFileSync(behaviorsPath, [
            "enum {",
            "    MB_NORMAL,",
            "    MB_TALL_GRASS = 2,",
            "    MB_DEEP_SAND,",
            "};",
            "#define MB_INVALID 0xFF",
            "",
          ].join("\n"));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.behaviors).toEqual([
            { name: "MB_NORMAL", value: 0 },
            { name: "MB_TALL_GRASS", value: 2 },
            { name: "MB_DEEP_SAND", value: 3 },
            { name: "MB_INVALID", value: 255 },
          ]);
        } finally { restore(); }
      });

      // B15a/B15b literal forms: hex, octal, suffix and sign are read; a bad octal or unsafe value skips its member and
      // the implicit successors; a later literal ends the skip. The untouched subject header gives exactly its own
      // literal defines, in value order (stable for equal values).
      it("B15a/B15b: enum literal forms, skips ended by a literal, and the subject's exact behavior list", async () => {
        const behaviorsPath = resolve(root, "include/constants/metatile_behaviors.h");
        const original = readFileSync(behaviorsPath, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
        const own = [...original.matchAll(/^[ \t]*#define[ \t]+(MB_\w+)[ \t]+(0x[\da-f]+|\d+)[ \t]*$/gim)]
          .map(([, name, value]) => ({ name: name!, value: Number(value) }))
          .sort((a, b) => a.value - b.value);
        expect(own.length).toBeGreaterThan(0);
        const id = await idFor();
        expect((await block(pair.a, `block=${id}`)).options.behaviors).toEqual(own);
        const restore = restoreBytes([behaviorsPath]);
        try {
          writeFileSync(behaviorsPath, [
            "enum {",
            "    MB_HEX = 0x10,", "    MB_OCT = 010,", "    MB_SUF = 3u,",
            "    MB_BAD_OCT = 09,", "    MB_AFTER_BAD,",
            "    MB_BIG = 0x20000000000000,", "    MB_AFTER_BIG,",
            "    MB_NEG = -1,", "    MB_NEXT,",
            "};", "",
          ].join("\n"));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}`);
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          expect(result.body.options.behaviors).toEqual([
            { name: "MB_NEG", value: -1 },
            { name: "MB_NEXT", value: 0 },
            { name: "MB_SUF", value: 3 },
            { name: "MB_OCT", value: 8 },
            { name: "MB_HEX", value: 16 },
          ]);
        } finally { restore(); }
      });

      // Cap is the minimum over every consumer of the file, across all tileset symbols of it (B14b).
      it("B14b: aliased primary file caps block=0 at the all-symbol minimum", async () => {
        const uses = new Map<string, { symbol: string; cap: number }[]>();
        for (const layout of gba.layouts) {
          const split = gba.splitFor(layout).metatiles;
          for (const [symbol, cap] of [
            [layout.primaryTileset, split],
            [layout.secondaryTileset, gba.constants.metatilesTotal - split],
          ] as const) {
            const path = canonicalTilesetPath(gba.tilesetPaths(symbol).metatilesBin);
            uses.set(path, [...(uses.get(path) ?? []), { symbol, cap }]);
          }
        }
        let alias: { name: string; minimum: number } | undefined;
        for (const [path, entries] of uses) {
          const symbols = new Map<string, number[]>();
          for (const entry of entries) symbols.set(entry.symbol, [...(symbols.get(entry.symbol) ?? []), entry.cap]);
          if (symbols.size < 2) continue;
          const symbolMin = new Map([...symbols].map(([symbol, caps]) => [symbol, Math.min(...caps)]));
          const allMin = Math.min(...symbolMin.values());
          for (const name of gba.mapNames()) {
            const layout = gba.layoutForMap(name);
            const symbol = layout.primaryTileset;
            if (canonicalTilesetPath(gba.tilesetPaths(symbol).metatilesBin) !== path) continue;
            if ((symbolMin.get(symbol) ?? 0) > allMin) { alias = { name, minimum: allMin }; break; }
          }
          if (alias) break;
        }
        if (!alias) throw new Error("fixture needs an aliased primary file");
        const result = await block(alias.name, "block=0");
        expect(result.limits.cap).toBe(alias.minimum);
      });

      // A short blockdata refuses the cells past the data, with the 409 body of B14d.
      it("B14d: short GBA grid refuses the last cell with 409 BAD_GRID", async () => {
        const layout = gba.layoutForMap(pair.a);
        const width = layout.width, height = layout.height;
        const gridPath = resolve(root, layout.blockdataFilepath);
        const restore = restoreBytes([gridPath]);
        try {
          const bytes = readFileSync(gridPath);
          writeFileSync(gridPath, bytes.subarray(0, (width * height - 1) * 2));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?x=${width - 1}&y=${height - 1}`);
          expect(result.status, JSON.stringify(result.body)).toBe(409);
          expect(result.body.code).toBe("BAD_GRID");
          expect(result.body.error).toMatch(/has \d+ blocks, fewer than \d+×\d+/);
        } finally { restore(); }
      });
    } else {
      it("10: rejects a short tile draft", async () => {
        const data = await block(pair.a, `block=${await idFor()}`);
        await checkDraft("tiles", data.block.tiles.slice(0, 15));
      });
      it("10: rejects an unknown collision", async () => {
        const data = await block(pair.a, `block=${await idFor()}`);
        await checkDraft("collision", ["NO_SUCH_COLLISION", ...data.block.collision.slice(1)]);
      });
      // The whole grid is refused when the .blk is undersize, even for a cell inside the data.
      it("B15c: short GBC grid refuses a cell inside the data with 409 BAD_GRID", async () => {
        const map = gbc.map(pair.a);
        const blkPath = resolve(root, map.blkPath);
        const restore = restoreBytes([blkPath]);
        try {
          const bytes = readFileSync(blkPath);
          writeFileSync(blkPath, bytes.subarray(0, map.width * map.height - 1));
          const result = await request(`/api/edit/${encoded(pair.a)}/block?x=0&y=0&time=day`);
          expect(result.status, JSON.stringify(result.body)).toBe(409);
          expect(result.body.code).toBe("BAD_GRID");
          expect(result.body.error).toMatch(/has \d+ blocks, fewer than \d+×\d+/);
        } finally { restore(); }
      });
    }

    it("10: malformed names, unknown maps, ambiguous selectors and bad preview bodies are guarded", async () => {
      const valid = encoded(pair.a);
      const id = await idFor();
      const validPreview = identity(id, await block(pair.a, `block=${id}`));
      const cases: [string, number, unknown?][] = [
        ["/api/edit/%/block?block=0", 400], ["/api/block-sheet/%.png", 400],
        ["/api/edit/%/block/preview", 400, validPreview],
        ["/api/edit/NoSuchMapForBlockOracle/block?block=0", 404],
        ["/api/block-sheet/NoSuchMapForBlockOracle.png", 404],
        ["/api/edit/NoSuchMapForBlockOracle/block/preview", 404, validPreview],
        [`/api/edit/${valid}/block?x=0`, 400],
        [`/api/edit/${valid}/block?block=0&x=0&y=0`, 400],
        [`/api/edit/${valid}/block/preview`, 400, null],
        [`/api/edit/${valid}/block/preview`, 400, []],
      ];
      for (const [path, status, body] of cases) {
        const result = await request(path, body);
        expect(result.status, path).toBe(status);
        expect(result.body).toEqual({ error: expect.any(String), code: expect.any(String) });
      }
    }, 120_000);

    it("11b.1: check answers the GET usage for a draft copied from another block", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const source = await findChangedSource(pair.a, data);
      if (!source) throw new Error("fixture needs another visible block in the same metatile file");
      const result = await blockCheck(pair.a, copiedRequest(data, source));
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.usage).toEqual(data.usage);
      expect(Array.isArray(result.body.warnings)).toBe(true);
      expect(result.body.refusal).toBeUndefined();
      expect(Object.keys(result.body).sort()).toEqual(["confirm", "usage", "warnings"]);
    }, 120_000);

    it("11b.16: check and apply plan the URL's map and ignore a map in the body (B5)", async () => {
      try {
        const data = await block(pair.a, `block=${await idFor()}`);
        const source = await findChangedSource(pair.a, data);
        if (!source) throw new Error("fixture needs another visible block in the same metatile file");
        const body = copiedRequest(data, source);
        body.request.map = other;
        const checked = await blockCheck(pair.a, body);
        expect(checked.status, JSON.stringify(checked.body)).toBe(200);
        expect(checked.body.refusal).toBeUndefined();
        expect(checked.body.usage).toEqual(data.usage);
        const depth = undoDepth(pair.a);
        const applied = await blockApply(pair.a, body);
        expect(applied.status, JSON.stringify(applied.body)).toBe(200);
        expect(undoDepth(pair.a)).toBe(depth + 1);
        expect(store.has(other)).toBe(false);
      } finally { store.closeAll(); }
    }, 120_000);

    it("11b.2: check.confirm follows the other maps that draw the block", async () => {
      const used = await (family === "gba" ? findGbaConfirm(true) : findGbcConfirm(true));
      const own = await (family === "gba" ? findGbaConfirm(false) : findGbcConfirm(false));
      if (!used || !own) {
        throw new Error("fixture needs a shared-file block used by another map and one only this map uses");
      }
      for (const [subject, want] of [[used, true], [own, false]] as const) {
        const result = await blockCheck(subject.name, {
          request: changedDraft(subject.data), revision: subject.data.revision,
        });
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        expect(result.body.confirm, `${subject.name} #${subject.id}`).toBe(want);
      }
      const data = await block(pair.a, `block=${await idFor()}`);
      const request = changedDraft(data);
      request.mode = "saveAsNew";
      const result = await blockCheck(pair.a, { request, revision: data.revision });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.confirm).toBe(false);
    }, 120_000);

    if (family === "gba") it("11b.3: check surfaces the planner's cross-half warning", async () => {
      const subject = await findGbaCrossHalf();
      if (!subject) throw new Error("fixture needs a tile that resolves to a different half across consumers");
      const body = draftRequest(subject.data);
      body.request.draft.entries[subject.index] = {
        ...body.request.draft.entries[subject.index], tile: subject.tile,
      };
      const result = await blockCheck(subject.name, body);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.refusal).toBeUndefined();
      const warning = `entry ${subject.index} tile differs:`;
      expect(result.body.warnings.some((text: string) => text.startsWith(warning)),
        JSON.stringify(result.body.warnings)).toBe(true);
    }, 120_000);

    it("11b.4: check refuses a stale revision without confirming", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const body = checkBody(data);
      body.revision = "0".repeat(40);
      const result = await blockCheck(pair.a, body);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.refusal).toEqual({ code: "STALE", error: expect.any(String) });
      expect(result.body.confirm).toBe(false);
    });

    it("11b.5: check leaves a closed store closed and an open session byte-identical", async () => {
      const id = await idFor();
      const first = await block(pair.a, `block=${id}`);
      expect(store.has(pair.a)).toBe(false);
      let result = await blockCheck(pair.a, { request: changedDraft(first), revision: first.revision });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(store.has(pair.a)).toBe(false);
      const map = await mapGet(pair.a);
      await paint(pair.a, map.blocks[0].metatileId === 0 ? 1 : 0);
      const current = await block(pair.a, `block=${id}`);
      const before = JSON.stringify(store.open(pair.a).session);
      const depth = historyLength(pair.a);
      result = await blockCheck(pair.a, { request: changedDraft(current), revision: current.revision });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(JSON.stringify(store.open(pair.a).session)).toBe(before);
      expect(historyLength(pair.a)).toBe(depth);
    }, 120_000);

    it("11b.6: apply saveAsNew stages a block at the cell and one undo reverts it", async () => {
      const subject = family === "gba" ? await findGbaSaveAsNew() : await findGbcSaveAsNew();
      if (!subject) throw new Error("fixture needs a map with a private grid and room to append a block");
      const { name, cell, data, width, files } = subject;
      const expected = data.limits.nextId as number;
      expect(typeof expected).toBe("number");
      const source = await findChangedSource(name, data);
      if (!source) throw new Error("fixture needs a visibly different block in the same metatile file");
      const index = cell.y * width + cell.x;
      const beforeCell = await block(name, cellQuery(cell));
      const renderPath = `/api/render/${encoded(name)}.png${family === "gbc" ? "?time=day" : ""}`;
      const beforeRender = await png(renderPath);
      const request = { ...copiedRequest(data, source).request, mode: "saveAsNew", from: "map", cell };
      const records = (bytes: Buffer) => bytes.toString("latin1").match(/^[ \t]*tilecoll\b.*$/gm)?.length ?? 0;
      const diskMetaLength = readFileSync(resolve(root, files[0]!)).length;
      const diskCompanion = readFileSync(resolve(root, files[1]!));
      const diskCollisionCount = family === "gbc" ? records(diskCompanion) : 0;
      const applied = await blockApply(name, { request, revision: data.revision });
      expect(applied.status, JSON.stringify(applied.body)).toBe(200);
      expectSessionBody(applied.body);
      expect(applied.body.blocks[index].metatileId).toBe(expected);
      expect(applied.body.canUndo).toBe(true);
      expect(await png(renderPath)).not.toEqual(beforeRender);
      expect(lastLabel(name)).toBe(`New block $${expected.toString(16).toUpperCase().padStart(2, "0")}`);
      const meta = stagedEdits(name).find(edit => edit.path === files[0]);
      expect(meta).toBeDefined();
      expect(meta!.after.length).toBe(diskMetaLength + 16);
      if (family === "gbc") {
        const collision = stagedEdits(name).find(edit => edit.path === files[1]);
        expect(collision).toBeDefined();
        expect(records(collision!.after)).toBe(diskCollisionCount + 1);
      } else {
        const attributes = stagedEdits(name).find(edit => edit.path === files[1]);
        expect(attributes).toBeDefined();
        expect(attributes!.after.length).toBe(diskCompanion.length + 2);
      }
      const atCell = await block(name, cellQuery(cell));
      expect(atCell.blockId).toBe(expected);
      expect(atCell.viaBorder).toBe(false);
      if (family === "gba") {
        expect(atCell.block.entries).toEqual(source.data.block.entries);
        expect(atCell.block.behavior).toBe(source.data.block.behavior);
        expect(atCell.block.layerType).toBe(source.data.block.layerType);
      } else {
        expect(atCell.block.tiles).toEqual(source.data.block.tiles);
        expect(atCell.block.collision).toEqual(source.data.block.collision);
      }
      await edit(name, "undo", {});
      const reverted = await block(name, cellQuery(cell));
      expect(reverted.blockId).toBe(beforeCell.blockId);
      expect(reverted.limits.nextId).toBe(beforeCell.limits.nextId);
      expect(await png(renderPath)).toEqual(beforeRender);
    }, 120_000);

    it("11b.6a (Plan 14.2 I1): a saveAsNew apply reports the grown count and one undo restores the old one", async () => {
      const subject = family === "gba" ? await findGbaSaveAsNew() : await findGbcSaveAsNew();
      if (!subject) throw new Error("fixture needs a map with a private grid and room to append a block");
      const { name, cell, data } = subject;
      const source = await findChangedSource(name, data);
      if (!source) throw new Error("fixture needs a visibly different block in the same metatile file");
      const request = { ...copiedRequest(data, source).request, mode: "saveAsNew", from: "map", cell };
      // The palette's starting point: the map payload's own counts, read before anything is staged.
      const before = await mapGet(name);
      // GBA splits the counts by half; the appended id's own half is the one that grows.
      const inPrimary = family === "gba"
        ? (data.limits.nextId as number) < gba.splitFor(gba.layoutForMap(name)).metatiles
        : true;
      const applied = await blockApply(name, { request, revision: data.revision });
      expect(applied.status, JSON.stringify(applied.body)).toBe(200);
      if (family === "gba") {
        // e.g. primary 512 -> 513 with secondary unchanged (0 or 1 added to exactly one half).
        expect(applied.body.primaryCount).toBe(before.primaryCount + (inPrimary ? 1 : 0));
        expect(applied.body.secondaryCount).toBe(before.secondaryCount + (inPrimary ? 0 : 1));
      } else {
        // e.g. 40 -> 41 metatiles.
        expect(applied.body.metatileCount).toBe(before.metatileCount + 1);
      }
      // One undo drops the staged append, so the very next reply reports the original counts again --
      // a palette that had grown must shrink back instead of offering a block that no longer exists.
      const undone = await edit(name, "undo", {});
      if (family === "gba") {
        expect(undone.primaryCount).toBe(before.primaryCount);
        expect(undone.secondaryCount).toBe(before.secondaryCount);
      } else {
        expect(undone.metatileCount).toBe(before.metatileCount);
      }
    }, 120_000);

    it("11b.7: apply ok rewrites block A in place and one undo restores its PNG", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const source = await findChangedSource(pair.a, data, { sameLayer: true });
      if (!source) throw new Error("fixture needs a visible same-layer block in the same metatile file");
      const reference = family === "gba" ? gba.layoutForMap(pair.a).name : pair.a;
      const suffix = family === "gbc" ? "?time=day" : "";
      const image = (id: number) => png(`/api/metatile/${encoded(reference)}/${id}.png${suffix}`);
      const before = await image(data.blockId);
      const applied = await blockApply(pair.a, copiedRequest(data, source));
      expect(applied.status, JSON.stringify(applied.body)).toBe(200);
      expectSessionBody(applied.body);
      expect(lastLabel(pair.a)).toBe(`Edit block $${data.blockId.toString(16).toUpperCase().padStart(2, "0")}`);
      const after = await block(pair.a, `block=${data.blockId}`);
      if (family === "gba") {
        expect(after.block.entries).toEqual(source.data.block.entries);
        expect(after.block.behavior).toBe(source.data.block.behavior);
        expect(after.block.layerType).toBe(source.data.block.layerType);
      } else {
        expect(after.block.tiles).toEqual(source.data.block.tiles);
        expect(after.block.collision).toEqual(source.data.block.collision);
      }
      expect(await image(data.blockId)).toEqual(source.png);
      await edit(pair.a, "undo", {});
      expect(await image(data.blockId)).toEqual(before);
    }, 120_000);

    it("11b.8: apply refuses another map's staged file with NOT_OWNER and stages nothing", async () => {
      stage(pair.b);
      const data = await block(pair.a, `block=${await idFor()}`);
      expect(store.has(pair.a)).toBe(false);
      const result = await blockApply(pair.a, { request: changedDraft(data), revision: data.revision });
      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error: expect.any(String), code: "NOT_OWNER" });
      expect(store.has(pair.a)).toBe(false);
      expect(undoDepth(pair.a)).toBe(0);
      expect(changedStaged(pair.a)).toEqual([]);
    }, 120_000);

    it("Q2: check refuses another map's staged file as a NOT_OWNER refusal", async () => {
      try {
        stage(pair.b);
        const depth = undoDepth(pair.b);
        const staged = changedStaged(pair.b).map(edit => ({
          ...edit, before: Buffer.from(edit.before), after: Buffer.from(edit.after),
        }));
        const id = await idFor();
        const data = await block(pair.a, `block=${id}`);
        expect(store.has(pair.a)).toBe(false);
        const result = await blockCheck(pair.a, { request: changedDraft(data), revision: data.revision });
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        expect(result.body).toEqual({
          usage: null, confirm: false, warnings: [],
          refusal: { code: "NOT_OWNER", error: expect.any(String) },
        });
        expect(result.body.refusal.error.startsWith(`${pair.a}: `)).toBe(true);
        expect(result.body.refusal.error).toContain(`${pair.b} has unsaved block edits`);
        expect(store.has(pair.a)).toBe(false);
        expect(undoDepth(pair.a)).toBe(0);
        expect(changedStaged(pair.a)).toEqual([]);
        const ownerData = await block(pair.b, `block=${id}`);
        const ownerCheck = await blockCheck(pair.b, { request: changedDraft(ownerData), revision: ownerData.revision });
        expect(ownerCheck.status, JSON.stringify(ownerCheck.body)).toBe(200);
        expect(ownerCheck.body.refusal).toBeUndefined();
        expect(ownerCheck.body.usage).toEqual(ownerData.usage);
        expect(typeof ownerCheck.body.confirm).toBe("boolean");
        expect(ownerCheck.body.warnings).toEqual([]);
        expect(store.entries().map(([name]) => name)).toEqual([pair.b]);
        expect(undoDepth(pair.b)).toBe(depth);
        expect(changedStaged(pair.b)).toEqual(staged);
      } finally { store.closeAll(); }
    }, 120_000);

    it("names the requesting map when another map owns the applied file", async () => {
      stage(pair.a);
      const data = await block(pair.b, `block=${await idFor()}`);
      const result = await blockApply(pair.b, { request: changedDraft(data), revision: data.revision });
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("NOT_OWNER");
      expect(result.body.error.startsWith(`${pair.b}: `)).toBe(true);
      expect(result.body.error).toContain(`${pair.a} has unsaved block edits`);
    }, 120_000);

    it("11b.9a: apply refuses a file changed on disk since the GET", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const unused = await findUnusedBlock(pair.a);
      if (!unused) throw new Error("fixture needs a metatile the map never draws");
      const path = resolve(root, unused.path);
      const restore = restoreBytes([path]);
      const renderPath = `/api/render/${encoded(pair.a)}.png${family === "gbc" ? "?time=day" : ""}`;
      try {
        const bytes = readFileSync(path);
        bytes[unused.id * 16] = bytes[unused.id * 16]! ^ 0xff;
        writeFileSync(path, bytes);
        const render = await png(renderPath);
        const result = await blockApply(pair.a, { request: changedDraft(data), revision: data.revision });
        expect(result.status).toBe(409);
        expect(result.body).toEqual({ error: expect.any(String), code: "STALE" });
        expect(store.has(pair.a)).toBe(false);
        expect(undoDepth(pair.a)).toBe(0);
        expect(await png(renderPath)).toEqual(render);
      } finally { restore(); }
    }, 120_000);

    it("11b.9b: apply refuses a paint after the GET and keeps its undo entry", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const map = await mapGet(pair.a);
      await paint(pair.a, map.blocks[0].metatileId === 0 ? 1 : 0);
      const depth = historyLength(pair.a);
      const result = await blockApply(pair.a, { request: changedDraft(data), revision: data.revision });
      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error: expect.any(String), code: "STALE" });
      expect(historyLength(pair.a)).toBe(depth);
    }, 120_000);

    it("11b.10: a no-op apply answers the session body without staging", async () => {
      const id = await idFor();
      const data = await block(pair.a, `block=${id}`);
      expect(store.has(pair.a)).toBe(false);
      const first = await blockApply(pair.a, checkBody(data));
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expectSessionBody(first.body);
      // Ruling B10a (s10): the body may open a session (both injected sessionBody helpers do), but the
      // no-op plan stages no file bytes, pushes no undo command and leaves the map clean.
      expect(first.body.isDirty).toBe(false);
      expect(first.body.canUndo).toBe(false);
      expect(undoDepth(pair.a)).toBe(0);
      expect(changedStaged(pair.a)).toEqual([]);
      const map = await mapGet(pair.a);
      await paint(pair.a, map.blocks[0].metatileId === 0 ? 1 : 0);
      const current = await block(pair.a, `block=${id}`);
      const depth = historyLength(pair.a);
      const second = await blockApply(pair.a, checkBody(current));
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expectSessionBody(second.body);
      expect(historyLength(pair.a)).toBe(depth);
    }, 120_000);

    it("11b.11: check and apply guard bad drafts, malformed names, null/array bodies and unknown maps", async () => {
      const data = await block(pair.a, `block=${await idFor()}`);
      const draft = (mutate: (value: any) => void) => {
        const body = draftRequest(data);
        mutate(body.request.draft);
        return body;
      };
      const bad: [string, unknown][] = family === "gba"
        ? [
          ["draft.entries", draft(value => { value.entries = value.entries.slice(0, 7); })],
          ["draft.behavior", draft(value => { value.behavior = gba.profile.metatileBehaviorMask + 1; })],
        ]
        : [
          ["draft.tiles", draft(value => { value.tiles = value.tiles.slice(0, 15); })],
          ["draft.collision", draft(value => { value.collision = ["NO_SUCH_COLLISION", ...value.collision.slice(1)]; })],
        ];
      for (const route of ["check", "apply"]) {
        for (const [field, body] of bad) {
          const result = await request(`/api/edit/${encoded(pair.a)}/block/${route}`, body);
          expect(result.status, `${route} ${field}`).toBe(400);
          expect(result.body).toEqual({ error: expect.any(String), code: "BAD_VALUE" });
          expect(result.body.error.startsWith(field), `${route} ${field}: ${result.body.error}`).toBe(true);
        }
      }
      const valid = checkBody(data);
      const cases: [string, number, unknown][] = [
        ["/api/edit/%/block/check", 400, valid],
        ["/api/edit/%/block/apply", 400, valid],
        ["/api/edit/NoSuchMapForBlockOracle/block/check", 404, valid],
        ["/api/edit/NoSuchMapForBlockOracle/block/apply", 404, valid],
        [`/api/edit/${encoded(pair.a)}/block/check`, 400, null],
        [`/api/edit/${encoded(pair.a)}/block/apply`, 400, null],
        [`/api/edit/${encoded(pair.a)}/block/check`, 400, []],
        [`/api/edit/${encoded(pair.a)}/block/apply`, 400, []],
      ];
      for (const [path, status, body] of cases) {
        const result = await request(path, body);
        expect(result.status, path).toBe(status);
        expect(result.body).toEqual({ error: expect.any(String), code: expect.any(String) });
      }
    }, 120_000);

    it.each([
      ["null", null], ["array", []], ["missing y", { x: 1 }],
      ["string x", { x: "1", y: 0 }], ["fractional x", { x: 0.5, y: 0 }],
    ])("11b.12: check and apply reject a malformed cell (%s) before planning", async (_label, cell) => {
      try {
        const data = await block(pair.a, `block=${await idFor()}`);
        const body = { request: { ...changedDraft(data), mode: "saveAsNew", from: "map", cell },
          revision: data.revision };
        const hadSession = store.has(pair.a), depth = undoDepth(pair.a);
        for (const action of [blockCheck, blockApply]) {
          const result = await action(pair.a, body);
          expect(result.status, JSON.stringify(result.body)).toBe(400);
          expect(result.body).toEqual({ error: expect.any(String), code: "BAD_VALUE" });
          expect(result.body.error).toMatch(/^request\.cell/);
        }
        expect(store.has(pair.a)).toBe(hadSession);
        expect(undoDepth(pair.a)).toBe(depth);
      } finally { store.closeAll(); }
    }, 120_000);

    it("11b.13: check and apply surface the planner's outside-map BAD_VALUE", async () => {
      try {
        const map = await mapGet(pair.a);
        const data = await block(pair.a, `block=${await idFor()}`);
        const body = { request: { ...changedDraft(data), mode: "saveAsNew", from: "map",
          cell: { x: map.layout.width, y: 0 } }, revision: data.revision };
        for (const action of [blockCheck, blockApply]) {
          const result = await action(pair.a, body);
          expect(result.status, JSON.stringify(result.body)).toBe(400);
          expect(result.body).toEqual({ error: expect.any(String), code: "BAD_VALUE" });
          expect(result.body.error).toMatch(/cell is outside the map/);
        }
      } finally { store.closeAll(); }
    }, 120_000);

    it("11b.14: check returns a real planner refusal as 200 and apply returns 409 without staging", async () => {
      try {
        let name = pair.a;
        if (family === "gba") {
          // layoutForMap resolves map headers against the disk-loaded layouts. The planner
          // counts all maps sharing this path, whether or not they have open sessions.
          const names = [...gba.mapNames()].sort();
          const shared = names.find(candidate => {
            const path = gba.layoutForMap(candidate).blockdataFilepath;
            return names.filter(other => gba.layoutForMap(other).blockdataFilepath === path).length >= 2;
          });
          if (shared === undefined) throw new Error("fixture needs a shared GBA grid");
          name = shared;
        }
        const data = await block(name, family === "gba" ? "x=0&y=0" : `block=${await idFor()}`);
        const request = { ...changedDraft(data), mode: "saveAsNew", from: family === "gba" ? "map" : "palette",
          ...(family === "gba" ? { cell: { x: 0, y: 0 } } : {}) };
        if (family === "gbc") {
          const palName = (data.options.palettes as string[]).find(value => value !== data.block.tilePalettes[0]);
          if (palName === undefined) throw new Error("fixture needs another GBC palette name for square 0");
          request.draft.palettes = [{ square: 0, palName, scope: "all" }];
        }
        const body = { request, revision: data.revision };
        const code = family === "gba" ? "SHARED_GRID" : "ALL_WITH_SAVE_AS_NEW";
        const hadSession = store.has(name), depth = undoDepth(name);
        const checked = await blockCheck(name, body);
        expect(checked.status, `${name}: ${JSON.stringify(checked.body)}`).toBe(200);
        expect(checked.body.refusal).toEqual({ code, error: expect.any(String) });
        expect(checked.body.confirm).toBe(false);
        expect(store.has(name)).toBe(hadSession);
        expect(undoDepth(name)).toBe(depth);
        expect(changedStaged(name)).toEqual([]);
        const applied = await blockApply(name, body);
        expect(applied.status, `${name}: ${JSON.stringify(applied.body)}`).toBe(409);
        expect(applied.body).toEqual({ code, error: expect.any(String) });
        expect(store.has(name)).toBe(hadSession);
        expect(undoDepth(name)).toBe(depth);
        expect(changedStaged(name)).toEqual([]);
      } finally { store.closeAll(); }
    }, 120_000);

    it("Q2: GET planner refusal answers 409 with the planner's code, both families", async () => {
      const id = await idFor();
      const path = family === "gba"
        ? canonicalTilesetPath(gba.tilesetPaths(gba.layoutForMap(pair.a).primaryTileset).attributesBin)
        : pair.path;
      const collisionPath = family === "gbc"
        ? canonicalTilesetPath(gbc.tileset(gbc.map(pair.a).tileset).collisionPath) : undefined;
      const restore = restoreBytes([path, ...(collisionPath === undefined ? [] : [collisionPath])]
        .map(file => resolve(root, file)));
      try {
        expect(store.entries()).toEqual([]);
        let code: string, error: string;
        if (family === "gba") {
          // The loader accepts surplus whole attribute words, but the GET's
          // planGbaBlockEdit(mode: "ok") requires one word per metatile.
          const bytes = readFileSync(resolve(root, path));
          const size = gba.profile.metatileAttributesSize;
          writeFileSync(resolve(root, path), Buffer.concat([bytes, Buffer.alloc(size)]));
          const count = readFileSync(resolve(root, pair.path)).length / 16;
          code = "BAD_VALUE";
          error = `${path}: ${bytes.length / size + 1} attribute words for ${count} metatiles`;
        } else {
          // The loader accepts 257 complete records if collisions cover them.
          // The GET's own OK plan reaches patchGbcMetatiles, which enforces 256.
          const bytes = readFileSync(resolve(root, path));
          writeFileSync(resolve(root, path), Buffer.concat(Array.from({ length: 257 }, () => bytes.subarray(0, 16))));
          const collision = readFileSync(resolve(root, collisionPath!), "utf8");
          const line = collision.match(/^[ \t]*tilecoll\b.*$/gm)?.at(-1);
          if (!line) throw new Error("fixture needs a GBC collision record");
          writeFileSync(resolve(root, collisionPath!), `${collision.replace(/\s*$/, "\n")}${`${line}\n`.repeat(257)}`);
          code = "BLOCK_CAP";
          error = `${path}: block cap 256 exceeded (257 records)`;
        }
        const result = await request(`/api/edit/${encoded(pair.a)}/block?block=${id}${family === "gbc" ? "&time=day" : ""}`);
        expect(result.status, JSON.stringify(result.body)).toBe(409);
        expect(result.body).toEqual({ error, code });
        expect(store.entries()).toEqual([]);
        expect(undoDepth(pair.a)).toBe(0);
        expect(changedStaged(pair.a)).toEqual([]);
      } finally {
        store.closeAll();
        restore();
      }
    }, 120_000);

    if (family === "gba") it.each([
      ["behavior", "above mask"], ["behavior", "overflow"],
      ["layerType", "above mask"], ["layerType", "overflow"],
    ])("11b.15: check and apply reject draft.%s %s without 32-bit wrap", async (field, boundary) => {
      try {
        const data = await block(pair.a, `block=${await idFor()}`);
        const mask = gba.profile.metatileLayerTypeMask >>> 0;
        const shift = 31 - Math.clz32((mask & -mask) >>> 0);
        const limit = field === "behavior" ? gba.profile.metatileBehaviorMask : mask >>> shift;
        const request = changedDraft(data);
        request.draft = { ...request.draft, [field]: boundary === "overflow" ? 2 ** 32 : limit + 1 };
        for (const action of [blockCheck, blockApply]) {
          const result = await action(pair.a, { request, revision: data.revision });
          expect(result.status, JSON.stringify(result.body)).toBe(400);
          expect(result.body).toEqual({ error: expect.any(String), code: "BAD_VALUE" });
          expect(result.body.error.startsWith(`draft.${field}`)).toBe(true);
        }
      } finally { store.closeAll(); }
    }, 120_000);
  });
}
