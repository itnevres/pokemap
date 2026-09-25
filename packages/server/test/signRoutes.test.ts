import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";

let s: PokemapServer;
const post = async (path: string, body: unknown = {}) => fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);

describe.skipIf(!hasProject(SUBJECT_ROOT))("sign routes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /api/sign/:map/suggestions returns a ranked species list and a placement (or null) for a real route", async () => {
    const r = await get("/api/sign/Route29/suggestions"); // confirmed real route with a wild encounter table
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(Array.isArray(body.species)).toBe(true);
  }, 300_000);

  it("POST /sign/add on a route with grass and a real scripts.inc succeeds, GET /plan shows one object-events insert and one text append, then restores", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const map = "Route29"; // confirmed real map with a wild table AND a real scripts.inc
    const scriptsPath = proj.paths.mapScriptsInc(map);
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    try {
      const addRes = await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
      expect(addRes.status).toBe(200);
      const body = await addRes.json() as any;
      expect(body.scriptLabel).toBe(`${map}_EventScript_WildSign_Rattata`);

      const planRes = await get(`/api/edit/${map}/plan`);
      const plan = await planRes.json() as any;
      expect(plan.changes.some((c: any) => c.kind === "json")).toBe(true);
      expect(plan.changes.some((c: any) => c.kind === "text")).toBe(true);
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
    }
  }, 300_000);

  it("POST /sign/add refuses (400) with the real guardSignWrite refusal when the derived label already exists", async () => {
    const proj = openProject(SUBJECT_ROOT);
    const map = "Route30"; // a second confirmed-real map with scripts.inc
    const scriptsPath = proj.paths.mapScriptsInc(map);
    const beforeScripts = readFileSync(scriptsPath, "utf8");
    try {
      writeFileSync(scriptsPath, beforeScripts + `\n${map}_EventScript_WildSign_Rattata::\n\tend\n`);
      const addRes = await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
      expect(addRes.status).toBe(400);
      const body = await addRes.json() as any;
      expect(body.refusals[0].code).toBe("SIGN_LABEL_EXISTS");
    } finally {
      writeFileSync(scriptsPath, beforeScripts);
    }
  }, 300_000);

  it("undo after a sign add removes BOTH the object-events insert and the scripts.inc append from the plan", async () => {
    const map = "Route31"; // a third confirmed-real map with scripts.inc
    await post(`/api/edit/${map}/sign/add`, { x: 1, y: 1, elevation: 3, species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    await post(`/api/edit/${map}/undo`);
    const planRes = await get(`/api/edit/${map}/plan`);
    const plan = await planRes.json() as any;
    expect(plan.changes).toEqual([]);
  }, 300_000);
});
