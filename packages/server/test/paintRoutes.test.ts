import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

let s: PokemapServer;
const post = async (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });

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
