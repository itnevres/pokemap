import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createProjectHandler, type ProjectHandler } from "../src/index.js";
import { copyGbaTilesetProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTilesetProject.js";
import { openProject } from "@pokemap/core/src/project.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

let s: PokemapServer;
const post = async (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!hasProject(SUBJECT_ROOT))("Q1: GBA session snapshots (hermetic temp copy)", () => {
  let root: string;
  let handler: ProjectHandler;
  let server: Server;
  let base: string;
  const nothing = {
    tilesetVersion: expect.any(Number), tilesetInstance: expect.any(String), blocks: [], border: [], map: null,
    isDirty: false, canUndo: false, canRedo: false,
  };
  const get = (name: string) => fetch(`${base}/api/edit/${name}/session`);
  const post = (name: string, action: string, body: unknown = {}) =>
    fetch(`${base}/api/edit/${name}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const paint = async (name: string) => {
    const begun = await post(name, "paint/begin");
    expect(begun.status).toBe(200);
    const before = await begun.json() as { blocks: { metatileId: number }[] };
    const metatileId = before.blocks[0]!.metatileId === 42 ? 43 : 42;
    expect((await post(name, "paint/apply", {
      tool: "pencil", targets: [{ x: 0, y: 0 }],
      stamp: { width: 1, height: 1, cells: [{ metatileId }] }, origin: { x: 0, y: 0 },
    })).status).toBe(200);
    const ended = await post(name, "paint/end");
    expect(ended.status).toBe(200);
    return { metatileId, body: await ended.json() };
  };

  beforeAll(async () => {
    root = copyGbaTilesetProject();
    handler = createProjectHandler(root);
    server = createHttpServer(handler.handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    handler?.dispose();
    if (root) removeGbaTemp(root);
  });

  it("Q1: never-opened map returns nothing-open without opening a session", async () => {
    const response = await get("VioletCity");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(nothing);
    expect(handler.dirtyMaps()).toEqual([]);
    // warmUp skips open sessions, including clean ones. A fresh cache render proves absence.
    expect(await handler.warmUp(["VioletCity"])).toMatchObject({ rendered: 1, skipped: 0, failed: 0 });
    expect(await (await post("VioletCity", "undo")).json()).toEqual(nothing);
  }, 300_000);

  it("Q1: painted map returns staged blocks and undo state without changing them", async () => {
    const painted = await paint("Route101");
    const response = await get("Route101");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(painted.body);
    expect(body).toMatchObject({ isDirty: true, canUndo: true, canRedo: false });
    expect(body).toHaveProperty("blocks.0.metatileId", painted.metatileId);
    expect(await (await get("Route101")).json()).toEqual(body);
    await post("Route101", "discard");
  }, 300_000);

  it("Q1: discarded map returns nothing-open again", async () => {
    await paint("NewBarkTown_Lab");
    expect((await post("NewBarkTown_Lab", "discard")).status).toBe(200);
    const response = await get("NewBarkTown_Lab");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(nothing);
    expect(await (await post("NewBarkTown_Lab", "undo")).json()).toEqual(nothing);
  }, 300_000);

  it("Q1: unknown map returns 404", async () => {
    const response = await get("NoSuchMap");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no map NoSuchMap" });
  });
});

// Q3: a metatiles.bin that is missing from disk is a refusal (409 BAD_VALUE
// naming the file), not an unhandled statSync ENOENT (500). Hermetic temp copy:
// the file is deleted inside each test and restored in `finally`.
describe.skipIf(!hasProject(SUBJECT_ROOT))("Q3: GBA paint with a missing metatiles file (hermetic temp copy)", () => {
  const MAP = "Route101";
  let root: string;
  let handler: ProjectHandler;
  let server: Server;
  let base: string;
  let split: number;
  let files: Record<"primary" | "secondary", string>; // canonical repo-relative metatiles.bin paths
  const post = (action: string, body: unknown = {}) =>
    fetch(`${base}/api/edit/${MAP}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const session = async () => (await fetch(`${base}/api/edit/${MAP}/session`)).json() as Promise<{ blocks: unknown[] }>;

  beforeAll(async () => {
    root = copyGbaTilesetProject();
    const project = openProject(root);
    const layout = project.layoutForMap(MAP);
    split = project.splitFor(layout).metatiles;
    files = {
      primary: canonicalTilesetPath(project.tilesetPaths(layout.primaryTileset).metatilesBin),
      secondary: canonicalTilesetPath(project.tilesetPaths(layout.secondaryTileset).metatilesBin),
    };
    handler = createProjectHandler(root);
    server = createHttpServer(handler.handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    handler?.dispose();
    if (root) removeGbaTemp(root);
  });

  for (const role of ["primary", "secondary"] as const) {
    it(`pencil, rect and bucket with a ${role}-tileset id answer 409 BAD_VALUE naming the file; shift still answers 200`, async () => {
      // primary ids are < split; secondary ids are >= split (the route maps them to the secondary file).
      const metatileId = role === "primary" ? 1 : split + 1;
      const stamp = { width: 1, height: 1, cells: [{ metatileId }] };
      const refused: [string, unknown][] = [
        ["pencil", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp, origin: { x: 0, y: 0 } }],
        ["rect", { tool: "rect", x0: 0, y0: 0, x1: 1, y1: 1, stamp, origin: { x: 0, y: 0 } }],
        ["bucket", { tool: "bucket", x: 0, y: 0, replacement: { metatileId } }],
      ];
      const path = resolve(root, files[role]);
      const bytes = readFileSync(path);
      try {
        const begun = await post("paint/begin");
        expect(begun.status).toBe(200);
        const before = (await begun.json() as { blocks: unknown[] }).blocks;
        rmSync(path);
        for (const [tool, body] of refused) {
          const response = await post("paint/apply", body);
          const answer = await response.json() as { error: string; code?: string };
          expect(response.status, `${tool}: ${JSON.stringify(answer)}`).toBe(409);
          expect(answer.code, tool).toBe("BAD_VALUE");
          expect(answer.error, tool).toContain(files[role]);
          expect((await session()).blocks, `${tool} left the blocks unchanged`).toEqual(before);
        }
        // shift names no ids, so it never reads the file.
        expect((await post("paint/apply", { tool: "shift", dx: 1, dy: 0 })).status).toBe(200);
      } finally {
        writeFileSync(path, bytes);
        await post("discard");
      }
    }, 300_000);
  }
});

describe.skipIf(!hasProject(SUBJECT_ROOT))("paint routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("begin/apply/end applies a pencil dab and undo reverts it, without ever touching disk", async () => {
    const map = "NewBarkTown_Lab";
    await post(`/api/edit/${map}/paint/begin`, {});
    const applyRes = await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
    });
    expect(applyRes.status).toBe(200);
    const applied = await applyRes.json() as any;
    expect(applied.blocks[0].metatileId).toBe(42);

    const endRes = await post(`/api/edit/${map}/paint/end`, {});
    expect(endRes.status).toBe(200);
    const ended = await endRes.json() as any;
    expect(ended.isDirty).toBe(true);

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    expect(undoRes.status).toBe(200);
    const undone = await undoRes.json() as any;
    expect(undone.blocks[0].metatileId).not.toBe(42);
    expect(undone.isDirty).toBe(false);
  }, 300_000);

  it("canUndo/canRedo track the session's own undo stack through a full begin/apply/end/undo/redo cycle", async () => {
    const map = "Route101"; // its own map, isolated from every other test's open session
    const begin = await post(`/api/edit/${map}/paint/begin`, {});
    expect((await begin.json() as any).canUndo).toBe(false); // nothing pushed yet

    await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 3 }] }, origin: { x: 0, y: 0 },
    });
    const end = await post(`/api/edit/${map}/paint/end`, {});
    const ended = await end.json() as any;
    expect(ended.canUndo).toBe(true);
    expect(ended.canRedo).toBe(false);

    const undo = await post(`/api/edit/${map}/undo`, {});
    const undone = await undo.json() as any;
    expect(undone.canUndo).toBe(false);
    expect(undone.canRedo).toBe(true);

    const redo = await post(`/api/edit/${map}/redo`, {});
    const redone = await redo.json() as any;
    expect(redone.canUndo).toBe(true);
    expect(redone.canRedo).toBe(false);
  }, 300_000);

  it("redo re-applies after an undo", async () => {
    const map = "NewBarkTown"; // a DIFFERENT map, to avoid the previous test's still-open session
    await post(`/api/edit/${map}/paint/begin`, {});
    await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 1, y: 1 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 7 }] }, origin: { x: 1, y: 1 },
    });
    await post(`/api/edit/${map}/paint/end`, {});
    await post(`/api/edit/${map}/undo`, {});
    const redoRes = await post(`/api/edit/${map}/redo`, {});
    const redone = await redoRes.json() as any;
    expect(redone.isDirty).toBe(true);
  }, 300_000);

  it("a bucket fill across many cells still produces exactly ONE undo step", async () => {
    const map = "PetalburgCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const mapPayload = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    // Fill from (10,3) -- measured directly against the real corpus (not
    // assumed): (0,0)'s own 4-connected same-id region in this layout is
    // exactly 1 cell (metatile 468, with no matching neighbour on any
    // side), so a fill seeded there could never prove "more than one cell
    // changed" regardless of the route's own correctness. (10,3) sits on
    // metatile 588, whose connected region is 9 cells; replacement id 1
    // cannot collide with it (588 !== 1).
    await post(`/api/edit/${map}/paint/apply`, { tool: "bucket", x: 10, y: 3, replacement: { metatileId: 1 } });
    const endRes = await post(`/api/edit/${map}/paint/end`, {});
    const ended = await endRes.json() as any;
    const changedCount = ended.blocks.filter((b: any, i: number) => b.metatileId !== mapPayload.blocks[i].metatileId).length;
    expect(changedCount).toBeGreaterThan(1); // the fill genuinely touched more than one cell

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    const undone = await undoRes.json() as any;
    // ONE undo call reverted the WHOLE fill, not one cell.
    expect(undone.blocks).toEqual(mapPayload.blocks.map((b: any) => ({ metatileId: b.metatileId, collision: b.collision, elevation: b.elevation })));
  }, 300_000);

  it("400s an apply with an unknown tool name", async () => {
    const map = "CherrygroveCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, { tool: "not-a-real-tool" });
    expect(r.status).toBe(400);
  }, 300_000);

  it("undo on a map with no open session is a no-op 200, not a 500", async () => {
    const r = await post(`/api/edit/VioletCity/undo`, {});
    expect(r.status).toBe(200);
  }, 300_000);

  // Task 8 Step 11 teeth-proof: a stray SECOND /paint/end with no
  // intervening /paint/begin (a duplicate network request, or a UI bug
  // firing both mouseup and blur) must be a no-op, not a second command
  // push -- editSessions.ts's own strokeStartBlocks reset after a
  // successful push is what makes that true. Without the reset, the
  // second /end call sees a still-truthy (stale) strokeStartBlocks and
  // pushes a SECOND "paint" command whose prev/next happen to carry the
  // same content as the first (no apply ran between the two /end calls),
  // so the blocks stay correct either way -- but the undo STACK now holds
  // two entries for one visible stroke, so a single undo() no longer
  // clears isDirty even though the blocks are already back to original.
  // That's the "later stroke's own undo boundary" corruption: exactly one
  // undo() must fully restore both the blocks AND isDirty for one click.
  it("a stray double /paint/end (no second /begin) does not corrupt the undo boundary", async () => {
    const map = "GoldenrodCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 2, y: 2 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] }, origin: { x: 2, y: 2 },
    });
    await post(`/api/edit/${map}/paint/end`, {});
    const secondEnd = await post(`/api/edit/${map}/paint/end`, {}); // stray duplicate
    expect(secondEnd.status).toBe(200);

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    const undone = await undoRes.json() as any;
    expect(undone.blocks[2].metatileId).not.toBe(5); // ONE undo fully reverted the one visible stroke
    expect(undone.isDirty).toBe(false); // ...and isDirty agrees: nothing left on the stack
  }, 300_000);

  // Code-review fix: the mirror-image bug. A stray SECOND /paint/begin with
  // no intervening /paint/end (a duplicate mousedown, or a UI retry) used
  // to unconditionally overwrite strokeStartBlocks with the session's
  // CURRENT (already-mutated) blocks -- silently dropping the FIRST paint
  // from ever reaching the undo stack and leaving isDirty false after it.
  // Reproduces the reviewer's own repro exactly: begin -> apply(id=11 at
  // 3,3) -> begin again (no end) -> apply(id=12 at 4,4) -> end -> undo.
  // Both cells must revert and isDirty must be false -- the FIRST paint
  // must not be silently kept.
  it("a stray double /paint/begin (no intervening /end) does not silently drop the first paint", async () => {
    const map = "Route29";
    const before = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    const w = before.layout.width;
    const idx = (x: number, y: number) => y * w + x;

    await post(`/api/edit/${map}/paint/begin`, {});
    await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 3, y: 3 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 11 }] }, origin: { x: 3, y: 3 },
    });
    const secondBegin = await post(`/api/edit/${map}/paint/begin`, {}); // stray duplicate, no /end in between
    expect(secondBegin.status).toBe(200);
    const secondApply = await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 4, y: 4 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 12 }] }, origin: { x: 4, y: 4 },
    });
    const applied = await secondApply.json() as any;
    // Both paints are visible before /end -- proves the FIRST paint (11)
    // was never reverted by the stray re-begin, only its snapshot was at
    // risk of being silently replaced.
    expect(applied.blocks[idx(3, 3)].metatileId).toBe(11);
    expect(applied.blocks[idx(4, 4)].metatileId).toBe(12);

    await post(`/api/edit/${map}/paint/end`, {});

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    const undone = await undoRes.json() as any;
    // ONE undo reverts the WHOLE gesture -- both cells, not just the second.
    expect(undone.blocks[idx(3, 3)].metatileId).toBe(before.blocks[idx(3, 3)].metatileId);
    expect(undone.blocks[idx(4, 4)].metatileId).toBe(before.blocks[idx(4, 4)].metatileId);
    expect(undone.isDirty).toBe(false);
  }, 300_000);

  it("400s a pencil apply missing origin, instead of throwing an opaque 500", async () => {
    const map = "Route30";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] },
      // origin omitted on purpose
    });
    expect(r.status).toBe(400);
  }, 300_000);

  it("400s a bucket apply missing x/y, instead of throwing an opaque 500", async () => {
    const map = "Route31";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, { tool: "bucket", replacement: { metatileId: 1 } });
    expect(r.status).toBe(400);
  }, 300_000);

  it("400s a shift apply missing dx/dy, instead of throwing an opaque 500", async () => {
    const map = "Route32";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, { tool: "shift" });
    expect(r.status).toBe(400);
  }, 300_000);

  it("rect tool takes x0,y0,x1,y1 and expands server-side, filling the whole rectangle in one apply call", async () => {
    const map = "GoldenrodCity";
    await post(`/api/edit/${map}/paint/begin`, {});
    const applyRes = await post(`/api/edit/${map}/paint/apply`, {
      tool: "rect", x0: 0, y0: 0, x1: 1, y1: 1, stamp: { width: 1, height: 1, cells: [{ metatileId: 3 }] }, origin: { x: 0, y: 0 },
    });
    const applied = await applyRes.json() as any;
    const layout = (await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any).layout;
    expect(applied.blocks[0].metatileId).toBe(3);
    expect(applied.blocks[1].metatileId).toBe(3);
    expect(applied.blocks[layout.width].metatileId).toBe(3); // (0,1)
    expect(applied.blocks[layout.width + 1].metatileId).toBe(3); // (1,1)
    await post(`/api/edit/${map}/paint/end`, {});
  }, 300_000);

  // Code-review fix (MapCanvas's own rect race): the client-side fix
  // routes a rect's apply through the same await-before-end ordering
  // pencil/bucket already used, so on the wire begin/apply/end always
  // arrive in that order for a real rect gesture -- this is the server
  // half of that guarantee: given that correct order, a rect's own apply
  // really does land ONE undo command, exactly like the pencil test above
  // (`begin/apply/end applies a pencil dab and undo reverts it`).
  it("a rect apply lands as one undo entry -- one undo() call fully reverts the whole rectangle", async () => {
    const map = "Route34";
    const before = await (await fetch(`http://127.0.0.1:${s.port}/api/map/${map}`)).json() as any;
    await post(`/api/edit/${map}/paint/begin`, {});
    await post(`/api/edit/${map}/paint/apply`, {
      tool: "rect", x0: 0, y0: 0, x1: 1, y1: 0, stamp: { width: 1, height: 1, cells: [{ metatileId: 9 }] }, origin: { x: 0, y: 0 },
    });
    const endRes = await post(`/api/edit/${map}/paint/end`, {});
    const ended = await endRes.json() as any;
    expect(ended.blocks[0].metatileId).toBe(9);
    expect(ended.blocks[1].metatileId).toBe(9);
    expect(ended.isDirty).toBe(true);

    const undoRes = await post(`/api/edit/${map}/undo`, {});
    const undone = await undoRes.json() as any;
    expect(undone.blocks[0].metatileId).toBe(before.blocks[0].metatileId);
    expect(undone.blocks[1].metatileId).toBe(before.blocks[1].metatileId);
    expect(undone.isDirty).toBe(false); // ONE undo() fully reverted the whole rect
  }, 300_000);

  it("400s a rect apply missing x0/y0/x1/y1, instead of throwing an opaque 500", async () => {
    const map = "Route33";
    await post(`/api/edit/${map}/paint/begin`, {});
    const r = await post(`/api/edit/${map}/paint/apply`, {
      tool: "rect", x0: 0, y0: 0, stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 },
      // x1/y1 omitted on purpose
    });
    expect(r.status).toBe(400);
  }, 300_000);
});
