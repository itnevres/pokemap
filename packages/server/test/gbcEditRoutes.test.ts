import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import type { ProjectHandler } from "../src/index.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { readFileSync } from "node:fs";
import { encodePng } from "@pokemap/cli/src/png.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { moveGbcEvent } from "@pokemap/core/src/gbc/edit/events.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { gbcWarpLinks } from "@pokemap/core/src/world/nearWarpAdapters.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { buildGbcWorldPayload } from "../src/gbcRoutes.js";
import { paintCells, floodFill, shiftGrid } from "@pokemap/core/src/gbc/edit/paint.js";
import type { Block } from "@pokemap/core/src/gbc/model/types.js";
import { GBC_SUBJECT_ROOT, copyGbcSubjectToTemp, hasGbcProject, removeTemp } from "@pokemap/core/test/gbc/helpers/corpus.js";

// Plan 7 Task 4. Every test WRITES, so everything runs against a hermetic temp
// copy of PerfPlus; the real PerfPlus is asserted untouched in afterAll. Hooks
// live inside the describe for the same reason as gbcRoutes.test.ts (a hoisted
// beforeAll would run, and copy 18 MB, even under a skipped describe).

const W = 10, H = 9; // NewBarkTown
const NBT = "/api/edit/NewBarkTown";
const stamp1 = (metatileId: number) => ({ width: 1, height: 1, cells: [{ metatileId }] });

interface SessionBody { blocks: Block[]; events: unknown; isDirty: boolean; canUndo: boolean; canRedo: boolean }
interface PlanBody { changes: { path: string; kind: string; summary: string }[]; refusals: { code: string }[] }

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("gbc edit routes (hermetic temp copy)", () => {
  let tmp: string;
  let h: ProjectHandler;
  let srv: Server;
  let base: string;

  beforeAll(async () => {
    tmp = copyGbcSubjectToTemp();
    h = createGbcProjectHandler(tmp);
    srv = createServer(h.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => (srv ? srv.close(() => resolve()) : resolve()));
    if (tmp) removeTemp(tmp);
    const st = spawnSync("git", ["status", "--porcelain"], { cwd: GBC_SUBJECT_ROOT, encoding: "utf8" });
    expect(st.status).toBe(0);
    expect(st.stdout).toBe("");
  });

  const get = (path: string) => fetch(base + path);
  const post = (path: string, body: unknown = {}) => fetch(base + path, { method: "POST", body: JSON.stringify(body) });
  const session = async (r: Response) => (await r.json()) as SessionBody;
  const png = async (name: string) => Buffer.from(await (await get(`/api/render/${name}.png`)).arrayBuffer());
  const plan = async (name = "NewBarkTown") => (await (await get(`/api/edit/${name}/plan`)).json()) as PlanBody;
  const pencil = (x: number, y: number, metatileId: number, name = "NewBarkTown") =>
    post(`/api/edit/${name}/paint/apply`, { tool: "pencil", targets: [{ x, y }], stamp: stamp1(metatileId), origin: { x, y } });

  it("1. plan on an untouched map is empty", async () => {
    const r = await get(`${NBT}/plan`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ changes: [], refusals: [] });
    await post(`${NBT}/discard`);
  });

  it("2. paint begin/apply/end: session shape, plan, dirtyMaps, render override, discard restores", async () => {
    const before = await png("NewBarkTown"); // populates renderCache
    await post(`${NBT}/paint/begin`);
    const applied = await session(await pencil(0, 0, 24));
    expect(applied.blocks[0]).toEqual({ metatileId: 24 });
    const ended = await session(await post(`${NBT}/paint/end`));
    expect(ended.blocks[0]!.metatileId).toBe(24);
    expect(ended.isDirty).toBe(true);
    expect(ended.canUndo).toBe(true);
    expect(ended.canRedo).toBe(false);
    expect(ended.events).toMatchObject({ warps: expect.any(Array), objects: expect.any(Array) });

    const p = await plan();
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]!.kind).toBe("binary");
    expect(h.dirtyMaps()).toEqual(["NewBarkTown"]);

    const during = await png("NewBarkTown");
    expect(during.equals(before)).toBe(false);

    const gone = await post(`${NBT}/discard`);
    expect(await gone.json()).toEqual({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    expect(h.dirtyMaps()).toEqual([]);
    expect((await png("NewBarkTown")).equals(before)).toBe(true);
  });

  it("3. rect, bucket, shift match the Task 2 paint functions run on the same input", async () => {
    await post(`${NBT}/discard`);
    const b0 = (await session(await post(`${NBT}/paint/begin`))).blocks;
    expect(b0).toHaveLength(W * H);

    const s2 = { width: 2, height: 1, cells: [{ metatileId: 30 }, { metatileId: 31 }] };
    const rect = await session(await post(`${NBT}/paint/apply`, { tool: "rect", x0: 3, y0: 2, x1: 1, y1: 1, stamp: s2, origin: { x: 1, y: 1 } }));
    const targets = [];
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) targets.push({ x, y });
    const e1 = paintCells(b0, W, H, targets, s2, 1, 1);
    expect(rect.blocks).toEqual(e1);
    expect(rect.blocks).not.toEqual(b0);

    const bucket = await session(await post(`${NBT}/paint/apply`, { tool: "bucket", x: 9, y: 8, replacement: { metatileId: 77 } }));
    const e2 = floodFill(e1, W, H, 9, 8, 77);
    expect(bucket.blocks).toEqual(e2);
    expect(bucket.blocks).not.toEqual(e1);

    const shifted = await session(await post(`${NBT}/paint/apply`, { tool: "shift", dx: 1, dy: -1 }));
    const e3 = shiftGrid(e2, W, H, 1, -1);
    expect(shifted.blocks).toEqual(e3);
    expect(shifted.blocks).not.toEqual(e2);
    await post(`${NBT}/discard`);
  });

  describe("4. malformed input is a 400/404, never a 500", () => {
    const apply = (body: unknown) => post(`${NBT}/paint/apply`, body);
    const okStamp = stamp1(5);
    const bad: { label: string; body: unknown; field: string }[] = [
      { label: "unknown tool", body: { tool: "laser" }, field: "tool" },
      { label: "stamp cells length mismatch", body: { tool: "pencil", targets: [], stamp: { width: 2, height: 2, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 } }, field: "stamp" },
      { label: "stamp zero width", body: { tool: "pencil", targets: [], stamp: { width: 0, height: 1, cells: [] }, origin: { x: 0, y: 0 } }, field: "stamp" },
      { label: "non-integer metatileId", body: { tool: "pencil", targets: [], stamp: { width: 1, height: 1, cells: [{ metatileId: 1.5 }] }, origin: { x: 0, y: 0 } }, field: "stamp" },
      { label: "non-integer target", body: { tool: "pencil", targets: [{ x: 0.5, y: 0 }], stamp: okStamp, origin: { x: 0, y: 0 } }, field: "targets" },
      { label: "targets not an array", body: { tool: "pencil", targets: "x", stamp: okStamp, origin: { x: 0, y: 0 } }, field: "targets" },
      { label: "non-integer origin", body: { tool: "pencil", targets: [], stamp: okStamp, origin: { x: 0, y: 1.5 } }, field: "origin" },
      { label: "rect non-integer corner", body: { tool: "rect", x0: 0, y0: 0, x1: 1.2, y1: 1, stamp: okStamp, origin: { x: 0, y: 0 } }, field: "x1" },
      { label: "bucket non-integer replacement", body: { tool: "bucket", x: 0, y: 0, replacement: { metatileId: 2.5 } }, field: "replacement" },
      { label: "bucket non-integer x", body: { tool: "bucket", x: "0", y: 0, replacement: { metatileId: 2 } }, field: "x" },
      { label: "shift non-integer dx", body: { tool: "shift", dx: 0.5, dy: 0 }, field: "dx" },
    ];
    for (const { label, body, field } of bad) {
      it(`${label} -> 400 naming ${field}`, async () => {
        const r = await apply(body);
        expect(r.status).toBe(400);
        expect(((await r.json()) as { error: string }).error).toContain(`"${field}"`);
      });
    }

    it("malformed JSON -> 400", async () => {
      const r = await fetch(`${base}${NBT}/paint/apply`, { method: "POST", body: "{nope" });
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toMatch(/JSON/);
    });

    it("unknown map -> 404, malformed name -> 400, unknown sub-route -> 404", async () => {
      expect((await post("/api/edit/NoSuchMap/paint/begin")).status).toBe(404);
      expect((await get("/api/edit/NoSuchMap/plan")).status).toBe(404);
      expect((await post("/api/edit/%E0%A4%A/paint/begin")).status).toBe(400);
      expect((await post(`${NBT}/frobnicate`)).status).toBe(404);
      expect((await get("/api/edit/NewBarkTown")).status).toBe(404);
    });

    it("a rejected apply leaves the session unchanged", async () => {
      await post(`${NBT}/discard`);
      const s0 = await session(await post(`${NBT}/paint/begin`));
      await apply({ tool: "shift", dx: 0.5, dy: 0 });
      const s1 = await session(await post(`${NBT}/paint/end`));
      expect(s1.blocks).toEqual(s0.blocks);
      expect(s1.isDirty).toBe(false);
      await post(`${NBT}/discard`);
    });
  });

  it("5a. paint/end with no change pushes no undo step", async () => {
    await post(`${NBT}/discard`);
    await post(`${NBT}/paint/begin`);
    const same = (await session(await post(`${NBT}/paint/apply`, { tool: "shift", dx: 0, dy: 0 })));
    expect(same.isDirty).toBe(false);
    const ended = await session(await post(`${NBT}/paint/end`));
    expect(ended.canUndo).toBe(false);
    expect(ended.isDirty).toBe(false);
    await post(`${NBT}/discard`);
  });

  it("5b. a second begin keeps the first snapshot: undo restores the pre-first-paint blocks", async () => {
    await post(`${NBT}/discard`);
    const b0 = (await session(await post(`${NBT}/paint/begin`))).blocks;
    await pencil(0, 0, 24);
    await post(`${NBT}/paint/begin`); // redundant re-begin mid-stroke
    await pencil(1, 0, 25);
    const ended = await session(await post(`${NBT}/paint/end`));
    expect(ended.blocks[0]!.metatileId).toBe(24);
    expect(ended.blocks[1]!.metatileId).toBe(25);
    const undone = await session(await post(`${NBT}/undo`));
    expect(undone.blocks).toEqual(b0);
    expect(undone.isDirty).toBe(false);
    await post(`${NBT}/discard`);
  });

  it("6. undo/redo round-trip blocks; undo/redo on a never-opened map is the nothing-open shape", async () => {
    const nothing = { blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false };
    expect(await (await post("/api/edit/ElmsLab/undo")).json()).toEqual(nothing);
    expect(await (await post("/api/edit/ElmsLab/redo")).json()).toEqual(nothing);
    expect(h.dirtyMaps()).toEqual([]); // undo must not have opened a session

    await post(`${NBT}/discard`);
    const b0 = (await session(await post(`${NBT}/paint/begin`))).blocks;
    await pencil(2, 2, 40);
    const painted = await session(await post(`${NBT}/paint/end`));
    const undone = await session(await post(`${NBT}/undo`));
    expect(undone.blocks).toEqual(b0);
    expect(undone.canUndo).toBe(false);
    expect(undone.canRedo).toBe(true);
    expect(undone.isDirty).toBe(false);
    const redone = await session(await post(`${NBT}/redo`));
    expect(redone.blocks).toEqual(painted.blocks);
    expect(redone.isDirty).toBe(true);
    await post(`${NBT}/discard`);
  });

  // --- events (spec tests 7, 8) -------------------------------------------
  interface EventsBody extends SessionBody {
    events: { warps: { x: number; y: number; mapConst: string; destWarp: number }[]; coords: unknown[]; bgs: unknown[]; objects: unknown[]; objectConsts: string[] };
    warpRenumberWarnings?: { fromMap: string; warpIndex: number; destWarp: number }[];
  }
  const ev = (path: string, body: unknown, name = "NewBarkTown") => post(`/api/edit/${name}/event/${path}`, body);
  const evSession = async (r: Response) => (await r.json()) as EventsBody;
  // paint/end with no stroke open changes nothing and returns the session shape: a read-only probe.
  const snapshot = async (name = "NewBarkTown") => ({ session: await evSession(await post(`/api/edit/${name}/paint/end`)), plan: await plan(name) });
  const OBJ_ARGS = ["5", "5", "SPRITE_YOUNGSTER", "SPRITEMOVEDATA_STANDING_DOWN", "0", "0", "-1", "-1", "0", "OBJECTTYPE_COMMAND", "0", "NewBarkTownTestScript", "-1"];

  it("7a. event move/add/delete update events; plan shows 1 text change; undo reverts each step", async () => {
    await post(`${NBT}/discard`);
    const s0 = await evSession(await post(`${NBT}/paint/begin`));
    const w0 = s0.events.warps[0]!;
    expect([w0.x, w0.y]).toEqual([6, 3]);

    const moved = await evSession(await ev("move", { kind: "warp", index: 0, x: 7, y: 3 }));
    expect([moved.events.warps[0]!.x, moved.events.warps[0]!.y]).toEqual([7, 3]);
    expect(moved.isDirty).toBe(true);
    expect(moved.canUndo).toBe(true);

    const added = await evSession(await ev("add", { kind: "object", args: OBJ_ARGS, objectConst: "NEWBARKTOWN_TESTER" }));
    expect(added.events.objects).toHaveLength(s0.events.objects.length + 1);
    expect(added.events.objectConsts).toEqual([...s0.events.objectConsts, "NEWBARKTOWN_TESTER"]);

    const deleted = await evSession(await ev("delete", { kind: "coord", index: 0 }));
    expect(deleted.events.coords).toHaveLength(s0.events.coords.length - 1);
    expect(deleted.warpRenumberWarnings).toEqual([]); // present for every delete, empty for non-warp kinds

    const p = await plan();
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]!.kind).toBe("text");
    expect(p.refusals).toEqual([]);

    for (let i = 0; i < 2; i++) await post(`${NBT}/undo`);
    const back = await evSession(await post(`${NBT}/undo`)); // third undo: all three ops reverted
    expect(back.events).toEqual(s0.events);
    expect(back.isDirty).toBe(false);
    expect(back.canUndo).toBe(false);
    expect(back.canRedo).toBe(true);
    expect(await plan()).toEqual({ changes: [], refusals: [] });
    await post(`${NBT}/discard`);
  });

  it("7b. a move to the event's current position is a no-op: no undo step, not dirty", async () => {
    await post(`${NBT}/discard`);
    await post(`${NBT}/paint/begin`);
    const r = await evSession(await ev("move", { kind: "warp", index: 0, x: 6, y: 3 }));
    expect(r.isDirty).toBe(false);
    expect(r.canUndo).toBe(false);
    await post(`${NBT}/discard`);
  });

  it("7c. core refusals are 400 with the core's message and leave the session untouched", async () => {
    await post(`${NBT}/discard`);
    await post(`${NBT}/paint/begin`);
    await ev("move", { kind: "bg", index: 0, x: 3, y: 3 }); // some real unsaved state to compare against
    const before = await snapshot();

    const tooFar = await ev("move", { kind: "warp", index: 0, x: 999, y: 3 });
    expect(tooFar.status).toBe(400);
    expect(((await tooFar.json()) as { error: string }).error).toMatch(/x must be an integer 0\.\.255/);
    const referenced = await ev("delete", { kind: "object", index: 0 });
    expect(referenced.status).toBe(400);
    expect(((await referenced.json()) as { error: string }).error).toMatch(/NEWBARKTOWN_TEACHER is still referenced/);
    expect((await ev("add", { kind: "warp", args: ["1", "1", "NOT_A_MAP", "1"] })).status).toBe(400);
    expect((await ev("move", { kind: "coord", index: 9, x: 1, y: 1 })).status).toBe(400);

    expect(await snapshot()).toEqual(before);
    await post(`${NBT}/discard`);
  });

  it("7d. event bodies are validated: bad kind/index/x/args/objectConst/JSON are 400s naming the field", async () => {
    const cases: [string, unknown, string][] = [
      ["move", { kind: "door", index: 0, x: 1, y: 1 }, "kind"],
      ["move", { kind: "warp", index: 0.5, x: 1, y: 1 }, "index"],
      ["move", { kind: "warp", index: 0, x: "1", y: 1 }, "x"],
      ["move", { kind: "warp", index: 0, x: 1 }, "y"],
      ["add", { kind: "warp", args: "1,1,ELMS_LAB,1" }, "args"],
      ["add", { kind: "warp", args: ["1", "1", "ELMS_LAB", 1] }, "args"],
      ["add", { kind: "object", args: OBJ_ARGS, objectConst: 7 }, "objectConst"],
      ["delete", { kind: "warp" }, "index"],
      ["delete", { index: 0 }, "kind"],
    ];
    for (const [path, body, field] of cases) {
      const r = await ev(path, body);
      expect(r.status, `${path} ${JSON.stringify(body)}`).toBe(400);
      expect(((await r.json()) as { error: string }).error).toContain(`"${field}"`);
    }
    const r = await fetch(`${base}${NBT}/event/move`, { method: "POST", body: "{nope" });
    expect(r.status).toBe(400);
    expect(h.dirtyMaps()).toEqual([]);
    await post(`${NBT}/discard`);
  });

  // The renumber list is a hand-derivable fact about this corpus, pinned
  // literally AND cross-checked against an independent scan over the files.
  const WARP0_RENUMBER = [
    { fromMap: "ElmsLab", warpIndex: 0, destWarp: 1 },
    { fromMap: "ElmsLab", warpIndex: 1, destWarp: 1 },
    { fromMap: "PlayersHouse1F", warpIndex: 0, destWarp: 2 },
    { fromMap: "PlayersHouse1F", warpIndex: 1, destWarp: 2 },
    { fromMap: "PlayersNeighborsHouse", warpIndex: 0, destWarp: 3 },
    { fromMap: "PlayersNeighborsHouse", warpIndex: 1, destWarp: 3 },
    { fromMap: "ElmsHouse", warpIndex: 0, destWarp: 4 },
    { fromMap: "ElmsHouse", warpIndex: 1, destWarp: 4 },
  ];

  it("8a. deleting NewBarkTown warp 0 reports every warp targeting NEW_BARK_TOWN with destWarp >= 1", async () => {
    await post(`${NBT}/discard`);
    const proj = openGbcProject(tmp);
    const independent: typeof WARP0_RENUMBER = [];
    for (const m of proj.maps) {
      loadGbcMapEvents(tmp, m).events.warps.forEach((w, i) => {
        if (w.mapConst === "NEW_BARK_TOWN" && w.destWarp >= 1) independent.push({ fromMap: m.name, warpIndex: i, destWarp: w.destWarp });
      });
    }
    expect(independent).toEqual(WARP0_RENUMBER);

    const t0 = performance.now();
    const r = await evSession(await ev("delete", { kind: "warp", index: 0 }));
    const ms = performance.now() - t0;
    expect(r.warpRenumberWarnings).toEqual(WARP0_RENUMBER);
    expect(r.events.warps).toHaveLength(3);
    console.log(`warp-scan delete request: ${ms.toFixed(0)} ms`);

    // Deleting warp 1 (id 2) reports only ids >= 2: the id-1 warps do not shift.
    await post(`${NBT}/discard`);
    const r1 = await evSession(await ev("delete", { kind: "warp", index: 1 }));
    expect(r1.warpRenumberWarnings).toEqual(WARP0_RENUMBER.filter((w) => w.destWarp >= 2));
    await post(`${NBT}/discard`);
  });

  it("8b. the scan uses the deleting map's session warps (pre-delete), including an earlier unsaved warp edit", async () => {
    await post(`${NBT}/discard`);
    await post(`${NBT}/paint/begin`);
    // Unsaved: a new NewBarkTown warp that targets NewBarkTown itself, destWarp 2. On disk it does not exist.
    const added = await evSession(await ev("add", { kind: "warp", args: ["2", "2", "NEW_BARK_TOWN", "2"] }));
    expect(added.events.warps).toHaveLength(5);
    const r = await evSession(await ev("delete", { kind: "warp", index: 0 }));
    // Pre-delete index 4 (the delete has not renumbered it).
    expect(r.warpRenumberWarnings).toContainEqual({ fromMap: "NewBarkTown", warpIndex: 4, destWarp: 2 });
    expect(r.warpRenumberWarnings).toHaveLength(WARP0_RENUMBER.length + 1);
    await post(`${NBT}/discard`);
  });

  it("8c. the scan uses another map's open-session warps over its disk warps", async () => {
    await post(`${NBT}/discard`);
    await post("/api/edit/ElmsLab/discard");
    await post("/api/edit/ElmsLab/paint/begin");
    await ev("add", { kind: "warp", args: ["1", "1", "NEW_BARK_TOWN", "3"] }, "ElmsLab"); // unsaved on ElmsLab
    const r = await evSession(await ev("delete", { kind: "warp", index: 0 }));
    expect(r.warpRenumberWarnings).toContainEqual({ fromMap: "ElmsLab", warpIndex: 2, destWarp: 3 });
    await post(`${NBT}/discard`);
    await post("/api/edit/ElmsLab/discard");
    expect(h.dirtyMaps()).toEqual([]);
  });


  // --- commit (spec tests 9-13). These WRITE the temp copy, so they run after every read-only test. ---
  const read = (rel: string) => readFileSync(`${tmp}/${rel}`);
  const commit = (name: string) => post(`/api/edit/${name}/commit`);
  const diffBytes = (a: Buffer, b: Buffer) => { let n = 0; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++; return n; };

  it("9a. commit writes exactly 1 .blk byte and the spliced .asm, closes the session, and invalidates the render cache", async () => {
    await post(`${NBT}/discard`);
    const pngBefore = await png("NewBarkTown"); // populates renderCache
    const blkBefore = read("maps/NewBarkTown.blk");
    const asmBefore = read("maps/NewBarkTown.asm").toString("utf8");

    await post(`${NBT}/paint/begin`);
    await pencil(0, 0, 24);
    await post(`${NBT}/paint/end`);
    await ev("move", { kind: "warp", index: 0, x: 7, y: 3 });
    expect(h.dirtyMaps()).toEqual(["NewBarkTown"]);

    const r = await commit("NewBarkTown");
    expect(r.status).toBe(200);
    const body = (await r.json()) as PlanBody;
    expect(body.changes.map((c) => c.kind).sort()).toEqual(["binary", "text"]);
    expect(body.refusals).toEqual([]);

    const blkAfter = read("maps/NewBarkTown.blk");
    expect(blkAfter).toHaveLength(blkBefore.length);
    expect(diffBytes(blkBefore, blkAfter)).toBe(1);
    expect(blkAfter[0]).toBe(24);
    expect(read("maps/NewBarkTown.asm").toString("utf8")).toBe(moveGbcEvent(asmBefore, "NewBarkTown", "warp", 0, 7, 3).text);

    expect(h.dirtyMaps()).toEqual([]);
    expect(await plan()).toEqual({ changes: [], refusals: [] }); // a fresh session opened on the committed files
    await post(`${NBT}/discard`);

    const pngAfter = await png("NewBarkTown");
    expect(pngAfter.equals(pngBefore)).toBe(false);
    expect(pngAfter.equals(encodePng(renderGbcMap(openGbcProject(tmp), "NewBarkTown")))).toBe(true);
  });

  it("9b. commit invalidates the warp cache: /api/world reflects a moved warp", async () => {
    const world = async () => ((await (await get("/api/world")).json()) as { placements: Record<string, unknown> }).placements;
    const before = await world(); // populates warpCache
    // SproutTower1F is a lone map placed beside VioletCity's warp 6 (its arrival point), so moving that warp moves it.
    await post("/api/edit/VioletCity/discard");
    await post("/api/edit/VioletCity/paint/begin");
    const w6 = (await evSession(await ev("move", { kind: "warp", index: 6, x: 3, y: 5 }, "VioletCity"))).events.warps[6]!;
    expect([w6.x, w6.y]).toEqual([3, 5]);
    expect((await commit("VioletCity")).status).toBe(200);

    const after = await world();
    expect(after["SproutTower1F"]).not.toEqual(before["SproutTower1F"]);
    const fresh = openGbcProject(tmp);
    const expected = buildGbcWorldPayload(fresh, buildGbcWorld(fresh), readSidecar(tmp), gbcWarpLinks(fresh)).placements;
    expect(after).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it("10. a refused commit (metatile id out of range) is 400 and writes nothing", async () => {
    await post("/api/edit/ElmsLab/discard");
    const files = ["maps/ElmsLab.blk", "maps/ElmsLab.asm"];
    const before = files.map(read);
    await post("/api/edit/ElmsLab/paint/begin");
    await pencil(0, 0, 200, "ElmsLab");
    await post("/api/edit/ElmsLab/paint/end");
    const r = await commit("ElmsLab");
    expect(r.status).toBe(400);
    expect(((await r.json()) as PlanBody).refusals.map((x) => x.code)).toContain("metatile-out-of-range");
    files.forEach((f, i) => expect(read(f).equals(before[i]!)).toBe(true));
    expect(h.dirtyMaps()).toEqual(["ElmsLab"]); // still open and dirty so the client can fix it
    await post("/api/edit/ElmsLab/discard");
  });

  it("11. CeruleanCave2F (oversize .blk): plan says layout-not-writable, commit is 400, the file is untouched", async () => {
    const C = "/api/edit/CeruleanCave2F";
    const before = read("maps/CeruleanCave2F.blk");
    expect(before).toHaveLength(400);
    await post(`${C}/paint/begin`);
    await pencil(0, 0, 3, "CeruleanCave2F");
    await post(`${C}/paint/end`);
    expect((await plan("CeruleanCave2F")).refusals.map((x) => x.code)).toContain("layout-not-writable");
    expect((await commit("CeruleanCave2F")).status).toBe(400);
    expect(read("maps/CeruleanCave2F.blk").equals(before)).toBe(true);
    await post(`${C}/discard`);
  });

  it("12. a shared layout's plan summary ends with (shared by 50 maps)", async () => {
    const user = openGbcProject(tmp).maps.find((m) => m.blkPath === "maps/House1.blk")!.name;
    await post(`/api/edit/${user}/discard`);
    await post(`/api/edit/${user}/paint/begin`);
    const cur = (await session(await pencil(0, 0, 1, user))).blocks[0]!.metatileId;
    if (cur === 1) await pencil(0, 0, 2, user);
    await post(`/api/edit/${user}/paint/end`);
    const p = await plan(user);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0]!.summary.endsWith(" (shared by 50 maps)")).toBe(true);
    await post(`/api/edit/${user}/discard`);
  });

  it("13. dispose drops every session, then requests are 503", async () => {
    await post(`${NBT}/paint/begin`);
    await pencil(0, 0, 40);
    await post(`${NBT}/paint/end`);
    expect(h.dirtyMaps()).toEqual(["NewBarkTown"]);
    h.dispose();
    expect(h.dirtyMaps()).toEqual([]);
    expect((await get("/api/project")).status).toBe(503);
    expect((await post(`${NBT}/paint/begin`)).status).toBe(503);
  });

});
