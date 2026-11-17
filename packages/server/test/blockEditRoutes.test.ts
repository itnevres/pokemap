/** Task 11a read-route oracle. Expected data comes from disk, earlier HTTP responses and literals. */
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
import { stageTilesetPlan, type BlockEditPlan } from "../src/blockEditOwnership.js";
import { createProjectHandler } from "../src/index.js";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import * as gbaSessions from "../src/editSessions.js";
import * as gbcSessions from "../src/gbcEditSessions.js";
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
function suite(family: "gba" | "gbc") {
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
        if (family === "gbc") return true;
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
      if (!match) throw new Error("fixture needs two maps sharing a metatile file");
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
      let result = await block(pair.a, `block=${id}`);
      if (family === "gbc" && result.sheet.tileCount <= 0x60) {
        let found: any;
        for (const map of gbc.maps) {
          const candidate = await request(`/api/edit/${encoded(map.name)}/block?block=1&time=day`);
          if (candidate.status === 200 && candidate.body.sheet.tileCount > 0x60) {
            found = candidate.body;
            break;
          }
        }
        if (!found) throw new Error("fixture needs a GBC sheet with more than 0x60 cells");
        result = found;
      }
      const sheet = result.sheet;
      expect(sheet.url).toContain("tv=");
      if (family === "gbc") expect(sheet.url).toContain("time=");
      expect(sheet.tileIds).toHaveLength(sheet.tileCount);
      const first = await png(sheet.url + (family === "gba" ? "&pal=0" : ""));
      expect(dimensions(first)).toEqual({ width: 128, height: 8 * Math.ceil(sheet.tileCount / 16) });
      if (family === "gba") {
        expect(sheet.tileIds).toEqual(Array.from({ length: sheet.tileCount }, (_, i) => i));
        expect(await png(sheet.url + "&pal=1")).not.toEqual(first);
      } else {
        expect(sheet.tileCount, "sheet must include index 0x60").toBeGreaterThan(0x60);
        expect(sheet.tileIds[0x60]).toBe(0x80);
      }
    });

    it("7: identity preview matches a context-sensitive hub image and rejects an invalid tile", async () => {
      let name = pair.a;
      let id = -1;
      let reference: Buffer | undefined;
      if (family === "gba") {
        const map = await mapGet(name);
        for (let candidate = 0; candidate < map.primaryCount; candidate++) {
          const image = await png(`/api/metatile/${encoded(map.layout.name)}/${candidate}.png`);
          const rgba = pixels(image);
          const colors = new Set<string>();
          for (let offset = 0; offset < rgba.length; offset += 4) {
            colors.add(rgba.subarray(offset, offset + 4).toString("hex"));
          }
          if (colors.size < 2) continue;
          id = candidate; reference = image; break;
        }
        if (id < 0) throw new Error("fixture needs a visible, nonuniform editable GBA metatile");
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
      if (family === "gba") {
        const missing = Array.from({ length: 1024 }, (_, tile) => tile)
          .find(tile => !data.sheet.tileIds.includes(tile));
        body.request.draft.entries[0].tile = missing ?? data.sheet.tileCount;
      } else {
        expect(data.sheet.tileIds).not.toContain(0x60);
        body.request.draft.tiles[0] = 0x60;
      }
      const invalid = await request(`/api/edit/${encoded(name)}/block/preview`, body);
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

suite("gba");

