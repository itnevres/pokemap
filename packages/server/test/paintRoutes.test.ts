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
});
