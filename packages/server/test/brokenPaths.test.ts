import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
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

    const lj = `${root}/data/layouts/layouts.json`;
    const parsed = JSON.parse(readFileSync(lj, "utf8")) as { layouts: { id: string; blockdata_filepath: string }[] };
    parsed.layouts.find((l) => l.id === layout.id)!.blockdata_filepath = "../../outside.bin";
    writeFileSync(lj, JSON.stringify(parsed));
    const metatilesBin = probe.tilesetPaths(brokenTileset).metatilesBin;
    const mh = `${root}/src/data/tilesets/metatiles.h`;
    const text = readFileSync(mh, "utf8");
    expect(text).toContain(`"${metatilesBin}"`);
    writeFileSync(mh, text.replace(`"${metatilesBin}"`, `"../../outside/metatiles.bin"`));

    handler = createProjectHandler(root);
    server = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 300_000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    handler?.dispose();
    if (root) removeGbaTemp(root);
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
    // also the live-session branch and a named layout
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
