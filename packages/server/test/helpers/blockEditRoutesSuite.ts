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
import type { TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
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

      // Derived from the fix-2 brief's naming example (the rest of the brief is unreadable from this worktree: reads of
      // the .superpowers SDD folder are permission-denied). Assumes B15a: a layer-type enum member whose initializer the
      // parser cannot read is skipped, and the block GET still answers 200. The header written here is the source of
      // every expectation; the original header is restored in finally.
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
    });
  });
}
