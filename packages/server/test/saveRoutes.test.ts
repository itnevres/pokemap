import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

describe.skipIf(!hasProject(SUBJECT_ROOT))("save/commit routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("404s /plan and /commit for an unknown map", async () => {
    const planRes = await get("/api/edit/__pokemap_no_such_map__/plan");
    expect(planRes.status).toBe(404);
    const commitRes = await post("/api/edit/__pokemap_no_such_map__/commit");
    expect(commitRes.status).toBe(404);
  }, 300_000);

  it("GET /plan on an untouched session returns zero changes and never writes", async () => {
    const r = await get("/api/edit/CherrygroveCity/plan");
    expect(r.status).toBe(200);
    const plan = await r.json() as any;
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
  }, 300_000);

  it("paint, GET /plan shows one binary change, POST /commit actually writes it, then restores", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("EcruteakCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/EcruteakCity/paint/begin");
      await post("/api/edit/EcruteakCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/EcruteakCity/paint/end");

      const planRes = await get("/api/edit/EcruteakCity/plan");
      const plan = await planRes.json() as any;
      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0].kind).toBe("binary");

      const commitRes = await post("/api/edit/EcruteakCity/commit");
      expect(commitRes.status).toBe(200);
      expect(readFileSync(binPath)).not.toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);

  it("commit refuses (400) when the plan contains a refusal, and writes nothing", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("OlivineCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/OlivineCity/paint/begin");
      // 999, not the task text's original 999999: 999999 doesn't fit the
      // 10-bit block metatile mask (0x3ff = 1023) at all, so encodeBlocks
      // itself throws a hard Error before planSave ever gets to return a
      // soft Refusal -- planSave rejects with a 500, not the 400 this test
      // means to exercise. 999 is the value every other refusal test in
      // this codebase already uses (guards.test.ts, save.test.ts,
      // diff.test.ts, binary.test.ts): in-mask (fits 10 bits) but past
      // OlivineCity's own primary+secondary tileset boundary (measured
      // directly: split.metatiles=640, primaryCount=640, secondaryCount=340,
      // so the real ceiling is 980 and 999 is genuinely out of range) --
      // exactly the "encodable but semantically invalid" case
      // guardLayoutSave's metatile-out-of-range check exists to catch.
      await post("/api/edit/OlivineCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 999 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/OlivineCity/paint/end");
      const commitRes = await post("/api/edit/OlivineCity/commit");
      expect(commitRes.status).toBe(400);
      expect(readFileSync(binPath)).toEqual(before);
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);

  it("after a successful commit, the session is closed -- a later GET /plan reflects the NEW on-disk state as its own fresh baseline (zero changes again)", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("BlackthornCity");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);
    try {
      await post("/api/edit/BlackthornCity/paint/begin");
      await post("/api/edit/BlackthornCity/paint/apply", {
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 2 }] }, origin: { x: 0, y: 0 },
      });
      await post("/api/edit/BlackthornCity/paint/end");
      await post("/api/edit/BlackthornCity/commit");

      const planRes = await get("/api/edit/BlackthornCity/plan");
      const plan = await planRes.json() as any;
      expect(plan.changes).toEqual([]); // the just-written state IS the new baseline
    } finally {
      writeFileSync(binPath, before);
    }
  }, 300_000);

  // Plan 2 follow-up 5: POST /api/edit/:map/discard -- editSessions.ts's own
  // close(), exposed as an explicit route for the first time outside a
  // successful commit. AzaleaTown/AzaleaTown_Mart are used nowhere else in
  // this file's describe block (a single server + one editSessionStore is
  // shared across every test here, per beforeAll), so these tests don't
  // collide with the commit tests' own sessions above.
  it("404s /discard for an unknown map", async () => {
    const discardRes = await post("/api/edit/__pokemap_no_such_map__/discard");
    expect(discardRes.status).toBe(404);
  }, 300_000);

  it("POST /discard on a map with no open session at all is a harmless 200 no-op, same response shape as a closed session", async () => {
    const discardRes = await post("/api/edit/AzaleaTown_Mart/discard");
    expect(discardRes.status).toBe(200);
    expect(await discardRes.json()).toEqual({ blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false });
  }, 300_000);

  it("POST /discard closes a real, dirty session -- matches the undo/redo 'nothing open' shape, a later GET /plan shows a genuinely FRESH session re-read from disk (not a canned response over a still-open one), and disk is never touched", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const layout = proj.layoutForMap("AzaleaTown");
    const binPath = `${SUBJECT_ROOT}/${layout.blockdataFilepath}`;
    const before = readFileSync(binPath);

    await post("/api/edit/AzaleaTown/paint/begin");
    // collision:3/elevation:15 alongside a real metatileId, not just a bare
    // id -- makes this stroke's own diff from AzaleaTown's real (0,0) block
    // vanishingly unlikely to coincidentally already match, so the isDirty
    // check just below is a meaningful assertion, not a coin flip.
    await post("/api/edit/AzaleaTown/paint/apply", {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 5, collision: 3, elevation: 15 }] }, origin: { x: 0, y: 0 },
    });
    const endRes = await post("/api/edit/AzaleaTown/paint/end");
    expect((await endRes.json() as any).isDirty).toBe(true); // confirm dirty before discarding

    const discardRes = await post("/api/edit/AzaleaTown/discard");
    expect(discardRes.status).toBe(200);
    expect(await discardRes.json()).toEqual({ blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false });

    // The real proof: a SUBSEQUENT /plan for the same map shows zero
    // pending changes, i.e. the server genuinely re-opened from disk on the
    // next open() rather than secretly keeping the old dirty session alive
    // behind a canned discard response.
    const planRes = await get("/api/edit/AzaleaTown/plan");
    const plan = await planRes.json() as any;
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);

    // discard() must never touch disk -- close() (editSessions.ts) only
    // ever deletes a Map entry. Trivially true from reading that function's
    // body, but verified explicitly here, matching this project's I8
    // discipline.
    expect(readFileSync(binPath)).toEqual(before);
  }, 300_000);
});
