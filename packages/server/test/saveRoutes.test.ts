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
});
