import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";

import { beforeEach, afterEach, vi } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { findGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { signHash } from "@pokemap/core/src/signs/marker.js";
import { createEditSessionStore, snapshotOf } from "../src/editSessions.js";
import * as sessions from "../src/editSessions.js";
import { buildGbaIndicator } from "@pokemap/core/src/indicator/gba.js";
import { suggestIndicatorPlacement } from "@pokemap/core/src/signs/suggest.js";
import { effectiveGbaScripts } from "../src/signRefresh.js";
import { insertArrayElement } from "@pokemap/core/src/write/jsonEdit.js";
import { applyScriptAppend } from "@pokemap/core/src/write/save.js";


describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA Indicator and background sign routes (temporary subject copy)", () => {
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
  let store: ReturnType<typeof createEditSessionStore>;
  const factory = createEditSessionStore;
  beforeEach(async () => {
    vi.spyOn(sessions, "createEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    root = mkdtempSync(join(tmpdir(), "pokemap-gba-sign-")).replace(/\\/g, "/");
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
    vi.restoreAllMocks();
    if (root) {
      const target = resolve(root);
      if (!target.startsWith(resolve(tmpdir()) + "\\") || !target.includes("pokemap-gba-sign-")) throw new Error("unsafe temporary path");
      rmSync(target, { recursive: true, force: true });
    }
  });
  const addIndicator = (species = "RATTATA", text = "HELLO") => request("indicator/add", { x: 1, y: 1, species, text });
  const state = () => structuredClone(snapshotOf(store.open(map).session));
  const indicatorIndex = () => store.open(map).session.map.objectEvents.length - 1;
  const updateIndicator = (species = "ZIGZAGOON", text = "HELLO", extra = {}) => request("indicator/update", {
    index: indicatorIndex(), scriptLabel: `${map}_EventScript_PokemonIndicator1`, species, text, ...extra,
  });
  it("suggestions exclude staged object positions and preserve the no-session default", async () => {
    const suggest = async () => {
      const r = await fetch(`http://127.0.0.1:${server.port}/api/indicator/${map}/suggestions`);
      expect(r.status).toBe(200);
      return (await r.json() as any).placement;
    };
    expect(store.has(map)).toBe(false);
    const first = await suggest();
    expect(first).toEqual(suggestIndicatorPlacement(openProject(root), map));
    expect(first).not.toBeNull(); expect(store.has(map)).toBe(false);
    expect((await request("indicator/add", { ...first, species: "RATTATA", text: "HELLO" })).status).toBe(200);
    const next = await suggest();
    expect(next).not.toBeNull(); expect(next).not.toEqual(first);
    expect(store.open(map).session.map.objectEvents.some(e => e.x === next.x && e.y === next.y)).toBe(false);
    expect(readFileSync(json(), "utf8")).toBe(originalMap);
    await request("undo", {}); expect(await suggest()).toEqual(first);
    await request("redo", {}); expect(await suggest()).toEqual(next);
    await request("discard", {}); expect(await suggest()).toEqual(first);
    expect(store.has(map)).toBe(false);
  });
  it("Indicator suggestions have the shared species contract and old add is gone", async () => {
    const r = await fetch(`http://127.0.0.1:${server.port}/api/indicator/${map}/suggestions`);
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.species.length).toBeGreaterThan(0);
    for (const item of body.species) expect(item).toEqual({ species: expect.any(String), name: expect.any(String), percent: expect.any(Number) });
    expect(body).toHaveProperty("placement");
    expect((await request("sign/add", {})).status).toBe(404);
  });
  it.each(["\n", "\r\n"])("Indicator add stages exact core bytes, commit equals plan (%j)", async eol => {
    const before = original.replace(/\r?\n/g, eol).replace(/(?:\r?\n)+$/, "");
    writeFileSync(scripts(), before);
    const proj = openProject(root);
    const built = buildGbaIndicator(map, before, proj.map(map).objectEvents.map(e => e.script), {
      x: 1, y: 1, elevation: 0, species: "RATTATA", paragraphs: [["HELLO"]],
    });
    const response = await addIndicator(); expect(response.status).toBe(200);
    expect(response.body.scriptLabel).toBe(built.scriptLabel);
    expect(disk()).toBe(before);
    expect(effectiveGbaScripts(proj, store.open(map).session)).toBe(applyScriptAppend(before, { path: scripts(), text: built.scriptAppendText }));
    const plan = (await request("plan")).body; expect(plan.refusals).toEqual([]);
    expect(plan.changes).toEqual([
      { path: json(), kind: "json", summary: "Route101.json -- 1 field edit" },
      { path: scripts(), kind: "text", summary: `${scripts()} -- append 13 lines` },
    ]);
    expect(built.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(RATTATA)");
    expect(built.scriptAppendText).toContain("\tplaymoncry SPECIES_RATTATA, CRY_MODE_NORMAL");
    expect(built.scriptAppendText).toContain('\t.string "HELLO$"');
    const expectedJson = insertArrayElement(originalMap, ["object_events"], proj.map(map).objectEvents.length, built.objectEvent);
    const expected = effectiveGbaScripts(proj, store.open(map).session);
    expect((await request("commit", {})).status).toBe(200); expect(disk()).toBe(expected);
    expect(readFileSync(json(), "utf8")).toBe(expectedJson);
    expect(JSON.parse(readFileSync(json(), "utf8")).object_events.at(-1)).toEqual(built.objectEvent);
  });
  it.each([undefined, 4])("Indicator Place -> move folds coordinates into the insert and saves exactly those bytes (elevation %j)", async elevation => {
    expect((await addIndicator()).status).toBe(200);
    const placed = state(), index = indicatorIndex();
    const inserted = structuredClone(store.open(map).session.insertOps[0]!);
    const movedValue = { ...(inserted.value as Record<string, unknown>), x: 2, y: 3, ...(elevation !== undefined ? { elevation } : {}) };
    expect((await request("event/move", { kind: "object", index, x: 2, y: 3, elevation })).status).toBe(200);
    const moved = state();
    expect(moved.jsonEdits).toEqual([]);
    expect(moved.insertOps).toEqual([{ ...inserted, value: movedValue }]);
    expect(moved.map.objectEvents[index]).toMatchObject({ x: 2, y: 3, elevation: elevation ?? 0 });
    const plan = (await request("plan")).body;
    expect(plan.refusals).toEqual([]);
    expect(plan.changes.map((c: any) => c.kind).sort()).toEqual(["json", "text"]);
    await request("undo", {}); expect(state()).toEqual(placed);
    await request("redo", {}); expect(state()).toEqual(moved);
    const expectedScripts = effectiveGbaScripts(openProject(root), store.open(map).session);
    expect(readFileSync(json(), "utf8")).toBe(originalMap);
    expect((await request("commit", {})).status).toBe(200);
    expect(readFileSync(json(), "utf8")).toBe(insertArrayElement(originalMap, ["object_events"], index, movedValue));
    expect(JSON.parse(readFileSync(json(), "utf8")).object_events[index]).toEqual(movedValue);
    expect(disk()).toBe(expectedScripts);
  });
  it("plain Add Event -> move plans and commits a clean object insert", async () => {
    const value = { ...JSON.parse(originalMap).object_events[0], x: 1, y: 1, elevation: 2 };
    const index = openProject(root).map(map).objectEvents.length;
    expect((await request("event/add", { kind: "object", value })).status).toBe(200);
    const added = state();
    expect((await request("event/move", { kind: "object", index, x: 2, y: 3 })).status).toBe(200);
    expect(store.open(map).session.jsonEdits).toEqual([]);
    expect((await request("plan")).body.refusals).toEqual([]);
    await request("undo", {}); expect(state()).toEqual(added);
    await request("redo", {});
    expect((await request("commit", {})).status).toBe(200);
    expect(readFileSync(json(), "utf8")).toBe(insertArrayElement(originalMap, ["object_events"], index, { ...value, x: 2, y: 3 }));
    expect(disk()).toBe(original);
  });
  it("moving an on-disk object still stages scalar jsonEdits", async () => {
    expect((await request("event/move", { kind: "object", index: 0, x: 2, y: 3, elevation: 4 })).status).toBe(200);
    expect(store.open(map).session.insertOps).toEqual([]);
    expect(store.open(map).session.jsonEdits).toEqual([
      { path: ["object_events", 0, "x"], value: 2 },
      { path: ["object_events", 0, "y"], value: 3 },
      { path: ["object_events", 0, "elevation"], value: 4 },
    ]);
    expect((await request("plan")).body.refusals).toEqual([]);
  });
  it("species Update plans graphics and cry changes with stable labels and commits exactly those bytes", async () => {
    expect((await addIndicator()).status).toBe(200); expect((await request("commit", {})).status).toBe(200);
    const beforeJson = readFileSync(json(), "utf8"), beforeScripts = disk();
    const beforeBlock = (await request(`indicator/at?index=${indicatorIndex()}`)).body.indicator;
    expect((await updateIndicator()).status).toBe(200);
    const plan = (await request("plan")).body;
    expect(plan.refusals).toEqual([]);
    expect(plan.changes).toEqual([
      { path: json(), kind: "json", summary: "Route101.json -- 1 field edit" },
      { path: scripts(), kind: "text", summary: "Update sign text in scripts.inc" },
    ]);
    expect(store.open(map).session.jsonEdits).toEqual([
      { path: ["object_events", indicatorIndex(), "graphics_id"], value: "OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)" },
    ]);
    const expectedScripts = beforeScripts.replace("playmoncry SPECIES_RATTATA", "playmoncry SPECIES_ZIGZAGOON");
    const expectedJson = beforeJson.replace('"OBJ_EVENT_GFX_SPECIES(RATTATA)"', '"OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)"');
    expect(effectiveGbaScripts(openProject(root), store.open(map).session)).toBe(expectedScripts);
    expect((await request(`indicator/at?index=${indicatorIndex()}`)).body.indicator).toMatchObject({
      scriptLabel: beforeBlock.scriptLabel, textLabel: beforeBlock.textLabel, text: beforeBlock.text,
    });
    expect((await request("commit", {})).status).toBe(200);
    expect(readFileSync(json(), "utf8")).toBe(expectedJson); expect(disk()).toBe(expectedScripts);
  });
  it("refuses update after an earlier object deletion without consuming undo; undoing deletion allows update", async () => {
    // Persist the Indicator to exercise original-JSON indices rather than pending-insert folding.
    await addIndicator(); expect((await request("commit", {})).status).toBe(200);
    expect(indicatorIndex()).toBeGreaterThan(0);
    expect((await request("event/delete", { kind: "object", index: 0 })).status).toBe(200);
    const before = state(); const entry = store.open(map);
    const history = { undo: entry.stack.canUndo(), redo: entry.stack.canRedo(), dirty: entry.session.isDirty };
    const r = await updateIndicator(); expect(r.status).toBe(400);
    expect(r.body.refusals[0].message).toContain("Save or undo the pending object deletion before editing this Indicator");
    expect(state()).toEqual(before);
    expect({ undo: entry.stack.canUndo(), redo: entry.stack.canRedo(), dirty: entry.session.isDirty }).toEqual(history);
    await request("undo", {}); expect(entry.session.removeOps).toEqual([]);
    expect((await updateIndicator()).status).toBe(200);
  });
  it.each(["add", "update"])("Indicator %s malformed charmaps name the real file and preserve history", async op => {
    await addIndicator(); const before = state(), entry = store.open(map);
    const history = { undo: entry.stack.canUndo(), redo: entry.stack.canRedo(), dirty: entry.session.isDirty };
    for (const malformed of ["", "this is not a charmap"]) {
      writeFileSync(`${root}/charmap.txt`, malformed);
      const r = op === "add" ? await addIndicator() : await updateIndicator();
      expect(r.status).toBe(400); expect(r.body.refusals[0].subject).toBe(`${root}/charmap.txt`);
      expect(r.body.refusals[0].message).toContain(`${root}/charmap.txt`);
      expect(r.body.refusals[0].fix).toBe("Restore a valid subject charmap and correct unsupported Indicator text before retrying.");
      expect(state()).toEqual(before);
      expect({ undo: entry.stack.canUndo(), redo: entry.stack.canRedo(), dirty: entry.session.isDirty }).toEqual(history);
    }
    await request("undo", {}); expect(state().scriptAppends).toEqual([]);
  });
  it("Indicator Place -> Update -> undo x2 -> redo x2 restores full snapshots", async () => {
    const before = state(); expect((await addIndicator()).status).toBe(200); const placed = state();
    expect((await updateIndicator()).status).toBe(200); const updated = state();
    expect(updated.map.objectEvents.at(-1)?.graphicsId).toBe("OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)");
    const scriptsBefore = effectiveGbaScripts(openProject(root), { ...store.open(map).session, ...placed });
    const scriptsAfter = effectiveGbaScripts(openProject(root), store.open(map).session);
    expect(scriptsAfter).toBe(scriptsBefore.replace("playmoncry SPECIES_RATTATA", "playmoncry SPECIES_ZIGZAGOON"));
    await request("undo", {}); expect(state()).toEqual(placed);
    await request("undo", {}); expect(state()).toEqual(before); expect((await request("plan")).body.changes).toEqual([]);
    await request("redo", {}); expect(state()).toEqual(placed);
    await request("redo", {}); expect(state()).toEqual(updated);
    expect((await request("plan")).body.refusals).toEqual([]);
    expect((await request("commit", {})).status).toBe(200);
    expect(disk()).toBe(scriptsAfter);
    expect(JSON.parse(readFileSync(json(), "utf8")).object_events.at(-1).graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)");
    // An identical update after Save must also leave an empty plan.
    expect((await updateIndicator()).status).toBe(200);
    expect((await request("plan")).body.changes).toEqual([]);
  });
  it("Indicator add twice numbers independently; unchanged update has no script diff or undo step", async () => {
    await addIndicator(); const placed = state();
    expect((await updateIndicator("RATTATA")).status).toBe(200); expect(state()).toEqual(placed);
    expect((await addIndicator()).body.scriptLabel).toBe(`${map}_EventScript_PokemonIndicator2`);
    await request("undo", {}); expect(state()).toEqual(placed);
    await request("undo", {}); expect((await request("plan")).body.changes).toEqual([]);
  });
  it.each(["add", "update"])("Indicator %s unreadable charmap refuses without altering session or undo", async op => {
    await addIndicator(); const before = state();
    const { unlinkSync } = await import("node:fs"); unlinkSync(`${root}/charmap.txt`);
    const response = op === "add" ? await addIndicator() : await updateIndicator();
    expect(response.status).toBe(400); expect(JSON.stringify(response.body.refusals)).toContain("charmap.txt"); expect(state()).toEqual(before);
    await request("undo", {}); expect(state().scriptAppends).toEqual([]);
  });
  it.each(["data/maps/Route101/scripts.inc", "src/data/text/species_names.h"])("Indicator missing %s refuses with its file and leaves undo untouched", async file => {
    const before = state(); const { unlinkSync } = await import("node:fs"); unlinkSync(`${root}/${file}`);
    const r = await addIndicator(); expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.refusals)).toContain(file.split("/").at(-1));
    expect(state()).toEqual(before); expect(store.open(map).stack.canUndo()).toBe(false);
  });
  it("Indicator shared script is disabled and update refuses against current map", async () => {
    await addIndicator(); const entry = store.open(map); const event = entry.session.map.objectEvents.at(-1)!;
    entry.session.map = { ...entry.session.map, objectEvents: [...entry.session.map.objectEvents, { ...event }] };
    const before = state();
    expect((await request(`indicator/at?index=${indicatorIndex()}`)).body.indicator).toMatchObject({ editable: false, reason: expect.stringContaining("shared script") });
    expect((await updateIndicator()).status).toBe(400); expect(state()).toEqual(before);
  });
  it("Indicator stale label, changed shape, unknown species and bad wrapping refuse atomically", async () => {
    await addIndicator(); const before = state();
    for (const extra of [{ scriptLabel: "Stale" }, { species: "BOGUS" }, { text: "ABCDEFGHIJKLMNOPQRSTUVWXY" }]) {
      const r = await updateIndicator("RATTATA", "HELLO", extra); expect(r.status).toBe(400); expect(r.body.refusals.length).toBeGreaterThan(0); expect(state()).toEqual(before);
    }
    const entry = store.open(map);
    entry.session.scriptAppends = entry.session.scriptAppends!.map(a => ({ ...a, text: a.text.replace("\tlock", "\tend") }));
    const changed = state();
    expect((await request(`indicator/at?index=${indicatorIndex()}`)).body.indicator.editable).toBe(false);
    expect((await updateIndicator()).status).toBe(400); expect(state()).toEqual(changed);
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
