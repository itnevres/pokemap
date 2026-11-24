import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createProjectHandler, type ProjectHandler } from "../src/index.js";
import { createEditSessionStore } from "../src/editSessions.js";
import { openProject } from "@pokemap/core/src/project.js";
import { PathEscapeError } from "@pokemap/core/src/gbc/load/pathGuard.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTilesetProject.js";

// Plan H F1c server half (D25): a layout or tileset whose path leaves the project
// does not stop the project opening, but the map that uses it cannot be rendered,
// opened for editing or saved; the answer is a typed 409 carrying the defect, and
// the defects route still shows it. A control map on healthy components is untouched.
// Hermetic temp copy: layouts.json and metatiles.h are edited in the copy only.
const LAYOUT_MAP = "VioletCity";      // its layout's blockdata path is broken
const TILESET_MAP = "NewBarkTown_Lab"; // its secondary tileset's .metatiles path is broken
const CONTROL_MAP = "Route101";        // healthy: shares neither with the two above

interface Refusal { error: string; code: string; defect: { file: string; key: string; path: string; message: string; fix: string } }

describe.skipIf(!hasProject(SUBJECT_ROOT))("F1c server: broken layout or tileset paths", () => {
  let root: string;
  let handler: ProjectHandler;
  let server: Server;
  let base: string;
  let brokenLayoutId: string;
  let brokenTileset: string;
  let primaryMap: string;
  let brokenPrimary: string;
  // Sentinel files at the resolved outside paths: a regression that reads outside shows as a wrong 200, not an ENOENT.
  const planted: string[] = [];
  let tracked: string[] = [];
  const snapshot = () => tracked.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : null));

  beforeAll(async () => {
    root = copyGbaTilesetProject();
    const probe = openProject(root);
    const layout = probe.layoutForMap(LAYOUT_MAP);
    brokenLayoutId = layout.id;
    const tilesetLayout = probe.layoutForMap(TILESET_MAP);
    brokenTileset = tilesetLayout.secondaryTileset;
    const control = probe.layoutForMap(CONTROL_MAP);
    // Preconditions: the control shares neither the broken layout nor the broken tileset.
    expect(control.id).not.toBe(layout.id);
    expect(control.id).not.toBe(tilesetLayout.id);
    expect([control.primaryTileset, control.secondaryTileset]).not.toContain(brokenTileset);
    expect(layout.primaryTileset === brokenTileset || layout.secondaryTileset === brokenTileset).toBe(false);

    // A map whose PRIMARY tileset is broken (a different tileset, so the secondary-only case above cannot hide a primary-only gap).
    const taken = new Set([layout.primaryTileset, layout.secondaryTileset, tilesetLayout.primaryTileset, tilesetLayout.secondaryTileset, control.primaryTileset, control.secondaryTileset]);
    const found = probe.mapNames().map((m) => ({ m, l: probe.layoutForMap(m) }))
      .find(({ l }) => !taken.has(l.primaryTileset) && !taken.has(l.secondaryTileset) && l.id !== layout.id && l.id !== tilesetLayout.id && l.id !== control.id);
    expect(found, "a map with its own primary tileset exists in the subject copy").toBeDefined();
    primaryMap = found!.m;
    brokenPrimary = found!.l.primaryTileset;

    const lj = `${root}/data/layouts/layouts.json`;
    const parsed = JSON.parse(readFileSync(lj, "utf8")) as { layouts: { id: string; blockdata_filepath: string }[] };
    parsed.layouts.find((l) => l.id === layout.id)!.blockdata_filepath = "../../outside.bin";
    writeFileSync(lj, JSON.stringify(parsed));
    const mh = `${root}/src/data/tilesets/metatiles.h`;
    let text = readFileSync(mh, "utf8");
    for (const [sym, out] of [[brokenTileset, "../../outside/metatiles.bin"], [brokenPrimary, "../../outside/primary-metatiles.bin"]] as const) {
      const metatilesBin = probe.tilesetPaths(sym).metatilesBin;
      expect(text).toContain(`"${metatilesBin}"`);
      text = text.replace(`"${metatilesBin}"`, `"${out}"`);
    }
    writeFileSync(mh, text);

    for (const rel of ["../../outside.bin", "../../outside/metatiles.bin", "../../outside/primary-metatiles.bin"]) {
      const file = resolve(root, rel);
      if (existsSync(file)) continue; // never overwrite or remove a file we did not create
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "SENTINEL");
      planted.push(file);
    }
    tracked = [lj, mh, ...[LAYOUT_MAP, TILESET_MAP, CONTROL_MAP, primaryMap].map((m) => `${root}/data/maps/${m}/map.json`)];

    handler = createProjectHandler(root);
    server = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 300_000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    handler?.dispose();
    if (root) removeGbaTemp(root);
    for (const file of planted) rmSync(file, { force: true });
    for (const dir of new Set(planted.map(dirname))) if (dir.endsWith("outside")) try { rmdirSync(dir); } catch { /* not empty: not ours */ }
  });

  const post = (path: string, body: unknown = {}) => fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
  const expectRefusal = async (res: Response, pathPart: string) => {
    expect(res.status).toBe(409);
    const body = await res.json() as Refusal;
    expect(body.code).toBe("broken-path");
    expect(body.defect.path).toContain(pathPart);
    expect(body.error).toContain(pathPart);
    return body;
  };

  it("the defects route still reports the broken layout and the broken tileset (the banner)", async () => {
    const layout = await (await fetch(`${base}/api/defects/${LAYOUT_MAP}`)).json() as { defects: { kind: string; message: string }[] };
    expect(layout.defects[0]).toMatchObject({ kind: "build" });
    expect(layout.defects[0]!.message).toContain(brokenLayoutId);
    const tileset = await (await fetch(`${base}/api/defects/${TILESET_MAP}`)).json() as { defects: { kind: string; message: string }[] };
    expect(tileset.defects[0]).toMatchObject({ kind: "build" });
    expect(tileset.defects[0]!.message).toContain(brokenTileset);
  }, 300_000);

  it("render refuses a broken layout and a broken tileset with a typed 409, not a 500", async () => {
    await expectRefusal(await fetch(`${base}/api/render/${LAYOUT_MAP}.png`), "../../outside.bin");
    await expectRefusal(await fetch(`${base}/api/render/${TILESET_MAP}.png`), "../../outside/metatiles.bin");
    // and by layout name (the cachedRender path, not the map name)
    await expectRefusal(await fetch(`${base}/api/render/${probeLayoutName(LAYOUT_MAP)}.png`), "../../outside.bin");
  }, 300_000);

  it("the map route refuses both", async () => {
    await expectRefusal(await fetch(`${base}/api/map/${LAYOUT_MAP}`), "../../outside.bin");
    await expectRefusal(await fetch(`${base}/api/map/${TILESET_MAP}`), "../../outside/metatiles.bin");
  }, 300_000);

  it("edit routes refuse to open a session for either, and none is left open", async () => {
    for (const [name, part] of [[LAYOUT_MAP, "../../outside.bin"], [TILESET_MAP, "../../outside/metatiles.bin"]] as const) {
      await expectRefusal(await post(`/api/edit/${name}/paint/begin`), part);
      await expectRefusal(await post(`/api/edit/${name}/paint/apply`, {
        tool: "pencil", targets: [{ x: 0, y: 0 }],
        stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 },
      }), part);
    }
    expect(handler.dirtyMaps()).toEqual([]);
    const session = await (await fetch(`${base}/api/edit/${LAYOUT_MAP}/session`)).json() as { map: unknown; blocks: unknown[] };
    expect(session.map).toBeNull();
    expect(session.blocks).toEqual([]);
  }, 300_000);

  it("routes that read the layout or its tilesets outside the edit family refuse too (metatile thumbnails, indicator suggestions)", async () => {
    await expectRefusal(await fetch(`${base}/api/metatile/${probeLayoutName(LAYOUT_MAP)}/1.png`), "../../outside.bin");
    await expectRefusal(await fetch(`${base}/api/metatile/${probeLayoutName(TILESET_MAP)}/1.png`), "../../outside/metatiles.bin");
    await expectRefusal(await fetch(`${base}/api/indicator/${LAYOUT_MAP}/suggestions`), "../../outside.bin");
    await expectRefusal(await fetch(`${base}/api/indicator/${TILESET_MAP}/suggestions`), "../../outside/metatiles.bin");
  }, 300_000);

  it("an edit route with its own 400 handler (event/create) still answers the typed 409", async () => {
    await expectRefusal(await post(`/api/edit/${LAYOUT_MAP}/event/create`, { kind: "object", x: 1, y: 1 }), "../../outside.bin");
    await expectRefusal(await post(`/api/edit/${TILESET_MAP}/event/create`, { kind: "object", x: 1, y: 1 }), "../../outside/metatiles.bin");
  }, 300_000);

  it("the block read, the plan and the commit refuse a broken map before reading outside, and change no file", async () => {
    const before = snapshot();
    for (const [name, part] of [[LAYOUT_MAP, "../../outside.bin"], [TILESET_MAP, "../../outside/metatiles.bin"]] as const) {
      await expectRefusal(await fetch(`${base}/api/edit/${name}/block?x=0&y=0`), part);
      await expectRefusal(await fetch(`${base}/api/edit/${name}/plan`), part);
      await expectRefusal(await post(`/api/edit/${name}/commit`), part);
    }
    expect(snapshot()).toEqual(before);
    expect(handler.dirtyMaps()).toEqual([]);
  }, 300_000);

  it("event options with a tile query answer the typed 409, not a 400", async () => {
    await expectRefusal(await fetch(`${base}/api/event-options/${LAYOUT_MAP}?x=0&y=0`), "../../outside.bin");
    await expectRefusal(await fetch(`${base}/api/event-options/${TILESET_MAP}?x=0&y=0`), "../../outside/metatiles.bin");
    expect((await fetch(`${base}/api/event-options/${CONTROL_MAP}?x=0&y=0`)).status).toBe(200);
  }, 300_000);

  it("a map whose map.json cannot be parsed keeps its routes' own answer (the gate does not turn it into a 500)", async () => {
    const mj = `${root}/data/maps/${CONTROL_MAP}/map.json`;
    const original = readFileSync(mj, "utf8");
    try {
      writeFileSync(mj, "{ not json");
      const res = await fetch(`${base}/api/edit/${CONTROL_MAP}/plan`);
      expect(res.status).not.toBe(409);
      expect(res.status).not.toBe(500);
    } finally { writeFileSync(mj, original); }
  }, 300_000);

  it("a broken PRIMARY tileset is refused on render, map and edit too", async () => {
    await expectRefusal(await fetch(`${base}/api/render/${primaryMap}.png`), "../../outside/primary-metatiles.bin");
    await expectRefusal(await fetch(`${base}/api/map/${primaryMap}`), "../../outside/primary-metatiles.bin");
    await expectRefusal(await post(`/api/edit/${primaryMap}/paint/begin`), "../../outside/primary-metatiles.bin");
    expect(() => createEditSessionStore(openProject(root)).open(primaryMap)).toThrow(PathEscapeError);
  }, 300_000);

  it("the session store itself refuses (defence in depth for callers that bypass the routes)", () => {
    const store = createEditSessionStore(openProject(root));
    expect(() => store.open(LAYOUT_MAP)).toThrow(PathEscapeError);
    expect(() => store.open(TILESET_MAP)).toThrow(PathEscapeError);
    expect(store.has(LAYOUT_MAP)).toBe(false);
    expect(store.has(TILESET_MAP)).toBe(false);
  }, 300_000);

  it("warm-up skips a broken map instead of failing it", async () => {
    expect(await handler.warmUp([LAYOUT_MAP, TILESET_MAP])).toMatchObject({ rendered: 0, skipped: 2, failed: 0 });
  }, 300_000);

  it("a healthy control map still renders, loads and edits", async () => {
    const png = await fetch(`${base}/api/render/${CONTROL_MAP}.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect((await fetch(`${base}/api/map/${CONTROL_MAP}`)).status).toBe(200);
    expect((await post(`/api/edit/${CONTROL_MAP}/paint/begin`)).status).toBe(200);
    expect((await post(`/api/edit/${CONTROL_MAP}/discard`)).status).toBe(200);
  }, 300_000);

  function probeLayoutName(map: string): string {
    return openProject(root).layoutForMap(map).name;
  }
});
