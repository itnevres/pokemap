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
import { beforeEach, afterEach } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { findGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { signHash } from "@pokemap/core/src/signs/marker.js";
import { createEditSessionStore } from "../src/editSessions.js";


describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA background sign routes (temporary subject copy)", () => {
  let root: string, server: PokemapServer, original: string, originalMap: string;
  const map = "Route101", label = "Route101_EventScript_PokemapSign1";
  const scripts = () => `${root}/data/maps/${map}/scripts.inc`;
  const json = () => `${root}/data/maps/${map}/map.json`;
  const disk = () => readFileSync(scripts(), "utf8");
  const request = async (route: string, body?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${server.port}/api/edit/${map}/${route}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const put = (mode = "free", text = "HELLO", extra = {}) => request("sign/put", { x: 0, y: 0, mode, text, ...extra });
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-gba-sign-"));
    // Real source files only; omit unrelated art/build output and the source .git.
    for (const part of ["data/layouts", "data/maps/Route101", "data/tilesets", "graphics/tilesets", "include", "src/data", "src/graphics.c", "charmap.txt", "porymap.project.cfg"]) {
      if (!existsSync(`${SUBJECT_ROOT}/${part}`)) continue;
      mkdirSync(dirname(`${root}/${part}`), { recursive: true });
      cpSync(`${SUBJECT_ROOT}/${part}`, `${root}/${part}`, { recursive: true });
    }
    cpSync(`${SUBJECT_ROOT}/data/maps/map_groups.json`, `${root}/data/maps/map_groups.json`);
    original = disk(); originalMap = readFileSync(json(), "utf8");
    server = await createServer({ projectPath: root, port: 0 });
  }, 300_000);
  afterEach(async () => {
    await server?.close();
    if (root) {
      const target = resolve(root);
      if (!target.startsWith(resolve(tmpdir()) + "\\") || !target.includes("pokemap-gba-sign-")) throw new Error("unsafe temporary path");
      rmSync(target, { recursive: true, force: true });
    }
  });
  it.each(["\n", "\r\n"])("places exact bytes and one bg event preserving EOL and absent final newline (%j)", async (eol) => {
    const before = original.replace(/\r?\n/g, eol).replace(/(?:\r?\n)+$/, "");
    writeFileSync(scripts(), before);
    expect((await put()).status).toBe(200);
    expect(disk()).toBe(before);
    const plan = (await request("plan")).body;
    expect(plan.refusals).toEqual([]); expect(plan.signNotices).toEqual([]);
    expect(plan.changes.map((c: any) => c.kind).sort()).toEqual(["json", "text"]);
    const hash = signHash('\t.string "HELLO$"');
    const expected = before + eol + eol + [label + "::", "\tmsgbox Route101_Text_PokemapSign1, MSGBOX_SIGN", "\tend", "", `@ pokemap:sign free ${hash}`, "Route101_Text_PokemapSign1:", '\t.string "HELLO$"'].join(eol);
    expect((await request("commit", {})).status).toBe(200);
    expect(disk()).toBe(expected);
    expect(JSON.parse(readFileSync(json(), "utf8")).bg_events.at(-1)).toEqual({ type: "sign", x: 0, y: 0, elevation: 0, player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script: label });
  });
  it("adopts an original sign without changing its body and supports undo/redo", async () => {
    const at = (await request("sign/at?x=5&y=9")).body;
    expect(at).toMatchObject({ kind: "sign", editable: true, mode: null, handEdited: false });
    expect(at.text).toBe(findGbaSign(original, "Route101_EventScript_RouteSign").paragraphs.map(p => p.join("\n")).join("\n\n"));
    expect((await put("free", at.text, { x: 5, y: 9, scriptLabel: at.scriptLabel })).status).toBe(200);
    await request("undo", {}); expect((await request("plan")).body.changes).toEqual([]);
    await request("redo", {}); expect((await request("commit", {})).status).toBe(200);
    expect(disk().replace(/^@ pokemap:sign free [a-f0-9]{8}\r?\n/m, "")).toBe(original);
  });
  it("undo frees the lowest number, update folds pending appends, discard writes nothing", async () => {
    await put(); await request("undo", {}); expect((await request("plan")).body.changes).toEqual([]);
    await put(); expect((await request("sign/at?x=0&y=0")).body.scriptLabel).toBe(label);
    expect((await put("free", "UPDATED", { scriptLabel: label })).status).toBe(200);
    expect((await put("free", "SECOND", { x: 1 })).status).toBe(200);
    expect((await put("free", "AGAIN", { scriptLabel: label })).status).toBe(200);
    expect((await request("plan")).body.refusals).toEqual([]);
    await request("undo", {}); expect((await request("sign/at?x=0&y=0")).body.text).toBe("UPDATED");
    await request("redo", {}); expect((await request("sign/at?x=0&y=0")).body.text).toBe("AGAIN");
    await request("discard", {}); expect(disk()).toBe(original); expect(readFileSync(json(), "utf8")).toBe(originalMap);
  });
  it("refresh is pure and deterministic and commit writes the planned bytes", async () => {
    expect((await put("name")).status).toBe(200); expect((await request("commit", {})).status).toBe(200);
    expect((await request("plan")).body.changes).toEqual([]); await request("discard", {});
    const names = `${root}/src/data/region_map/region_map_entries.h`;
    writeFileSync(names, readFileSync(names, "utf8").replace('_("ROUTE 101")', '_("NEW ROUTE")'));
    const proj = openProject(root), entry = createEditSessionStore(proj).open(map);
    const snapshot = structuredClone(entry.session);
    const { refreshGbaLinkedSigns } = await import("../src/signRefresh.js");
    const refreshed = refreshGbaLinkedSigns(proj, entry);
    expect(entry.session).toEqual(snapshot);
    expect(refreshGbaLinkedSigns(proj, entry)).toEqual(refreshed);
    expect(refreshed.session.scriptReplaces).toHaveLength(1);
    const planned = refreshed.session.scriptReplaces![0]!.after;
    expect(planned).toContain('"NEW ROUTE$"');
    expect((await request("plan")).body.changes).toHaveLength(1);
    expect((await request("commit", {})).status).toBe(200); expect(disk()).toBe(planned);
  });
  it.each(["leave", "refresh", "unlink"])("protects hand edits and supports %s", async action => {
    await put("name"); await request("commit", {});
    writeFileSync(scripts(), disk().replace('"ROUTE 101$"', '"HAND EDIT$"'));
    const edited = disk();
    expect((await request("plan")).body.signNotices).toEqual([{ scriptLabel: label, message: `${label} was edited outside PokeMap and was not refreshed.` }]);
    expect((await request("sign/at?x=0&y=0")).body.handEdited).toBe(true);
    expect((await put("name", "", { scriptLabel: label })).body.refusals[0].code).toBe("hand-edited");
    if (action !== "leave") {
      expect((await request("sign/resolve", { scriptLabel: label, action })).status).toBe(200);
      await request("undo", {}); expect((await request("plan")).body.signNotices).toHaveLength(1);
      await request("redo", {});
    }
    expect((await request("commit", {})).status).toBe(200);
    if (action === "leave") expect(disk()).toBe(edited);
    else expect(findGbaSign(disk(), label)).toMatchObject({ marker: { mode: action === "unlink" ? "free" : "name" }, paragraphs: [[action === "unlink" ? "HAND EDIT" : "ROUTE 101"]] });
  });
  it("reserves map-only script names and orphan text labels", async () => {
    writeFileSync(json(), originalMap.replace('Route101_EventScript_RouteSign', label));
    writeFileSync(scripts(), original + '\nRoute101_Text_PokemapSign2:\n\t.string "ORPHAN$"\n');
    expect((await put()).status).toBe(200);
    expect((await request("sign/at?x=0&y=0")).body.scriptLabel).toBe("Route101_EventScript_PokemapSign3");
  });
  it("painting alone preserves scripts exactly", async () => {
    const start = (await request("paint/begin", {})).body;
    await request("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ ...start.blocks[0], metatileId: (start.blocks[0].metatileId + 1) % 16 }] }, origin: { x: 0, y: 0 } });
    await request("paint/end", {}); expect((await request("commit", {})).status).toBe(200); expect(disk()).toBe(original);
  });
  it("source refusals prevent paint and script writes", async () => {
    await put("name"); await request("commit", {});
    const before = disk();
    const proj = openProject(root), blocksPath = `${root}/${proj.layoutForMap(map).blockdataFilepath}`, blocks = readFileSync(blocksPath);
    const start = (await request("paint/begin", {})).body;
    await request("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ ...start.blocks[0], metatileId: (start.blocks[0].metatileId + 1) % 16 }] }, origin: { x: 0, y: 0 } });
    await request("paint/end", {});
    writeFileSync(`${root}/src/data/region_map/region_map_entries.h`, "// missing names\n");
    expect((await request("plan")).body.refusals).toHaveLength(1);
    expect((await request("commit", {})).status).toBe(400);
    expect(disk()).toBe(before); expect(readFileSync(blocksPath)).toEqual(blocks);
  });
  it("validates requests and refuses occupancy, label mismatch and bad text without staging", async () => {
    for (const body of [null, [], { x: 0.5 }, { x: 0, y: 0, mode: "free", text: "OK", force: 1 }]) expect((await request("sign/put", body)).status).toBe(400);
    for (const text of ['BAD$', 'BAD"', 'ABCDEFGHIJKLMNOPQRS']) expect((await put("free", text)).body.refusals).toBeDefined();
    expect((await put("free", "OK", { x: 5, y: 9 })).body.refusals).toBeDefined();
    expect((await put("free", "OK", { scriptLabel: "missing" })).body.refusals).toBeDefined();
    expect((await request("plan")).body.changes).toEqual([]);
  });
  it("keeps hashes valid when another sign follows a sign at an unterminated EOF", async () => {
    writeFileSync(scripts(), original.replace(/(?:\r?\n)+$/, ""));
    expect((await put("name")).status).toBe(200);
    expect((await put("free", "SECOND", { x: 1 })).status).toBe(200);
    expect((await request("sign/at?x=0&y=0")).body.handEdited).toBe(false);
    expect((await request("plan")).body.signNotices).toEqual([]);
    expect((await request("commit", {})).status).toBe(200);
    expect(findGbaSign(disk(), label).marker?.hash).toBe(signHash(findGbaSign(disk(), label).body));
  });
  it("regenerates species text from current data and handles maps with no wild data", async () => {
    expect((await put("species")).status).toBe(200);
    expect((await request("sign/at?x=0&y=0")).body.text).toContain("ROUTE 101");
    const path = `${root}/src/data/wild_encounters.json`;
    const data = JSON.parse(readFileSync(path, "utf8"));
    for (const group of data.wild_encounter_groups) group.encounters = group.encounters.filter((e: any) => e.map !== "MAP_ROUTE101");
    writeFileSync(path, JSON.stringify(data));
    expect((await request("commit", {})).status).toBe(200);
    expect(findGbaSign(disk(), label).paragraphs.flat().join(" ")).toContain("No wild POKEMON here.");
  });
  it("returns empty and other wire shapes and refuses missing scripts and charmap", async () => {
    expect((await request("sign/at?x=0&y=0")).body).toEqual({ kind: "empty" });
    expect((await request("event/add", { kind: "bg", value: { type: "hidden_item", x: 0, y: 0, elevation: 0 } })).status).toBe(200);
    expect((await request("sign/at?x=0&y=0")).body).toEqual({ kind: "other", eventKind: "hidden_item" });
    await request("discard", {});
    writeFileSync(`${root}/charmap.txt`, "");
    expect((await put()).status).toBe(400);
    expect((await request("plan")).body.changes).toEqual([]);
    cpSync(`${SUBJECT_ROOT}/charmap.txt`, `${root}/charmap.txt`);
    rmSync(scripts());
    expect((await put()).body.refusals[0].subject).toBe(openProject(root).paths.mapScriptsInc(map));
    expect((await request("plan")).body.refusals).toHaveLength(1);
    expect((await request("commit", {})).status).toBe(400);
  });

});
