import { copyGbaScriptBody } from "@pokemap/core/src/addEvent/gbaCopy.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync, rmSync, statSync, utimesSync, cpSync, mkdirSync, existsSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { openProject } from "@pokemap/core/src/project.js";
import { parseTilesetPaths } from "@pokemap/core/src/load/tilesets.js";
import { createGbaAddEventRoutes } from "../src/addEventRoutes.js";
import * as eventOptions from "@pokemap/core/src/addEvent/gbaOptions.js";
import * as symbolBuilders from "@pokemap/core/src/defects/symbols.js";
import * as entryPointBuilders from "@pokemap/core/src/addEvent/entryPoints.js";
import * as entryPointSources from "@pokemap/core/src/addEvent/sources.js";
import { createProjectHandler } from "../src/index.js";
import * as sessions from "../src/editSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { copyGbaAddEventProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTempProject.js";

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA add-event routes over a temporary project", () => {
  let root: string, server: Server, base: string;
  let sharedRoot: string, sharedServer: Server, sharedBase: string;
  let sharedStore: typeof store;
  let verifyCandidate: ((candidate: any) => void) | undefined;
  const diskTests = new Set([
    "external definition removal rename and addition refresh options and create without invalidation",
    "map options and create share one lazy entry-point index until discard",
    "save rebuilds the entry-point index and exposes a newly saved reference",
    "external map references refresh immediately and discard still invalidates the index",
    "two flags commit the exact accumulated bytes while preserving all other header lines",
    "commit rebuilds symbols after plan and refuses an unrelated-file collision without writes",
    "saving the header owner lets another map allocate a new flag",
    "plan rebuilds symbols and refuses a definition added after create",
    "discard refreshes project options free slots and symbols after a disk header edit",
  ]);
  let store: ReturnType<typeof sessions.createEditSessionStore>;
  const factory = sessions.createEditSessionStore;
  const map = "Route101", other = "LittlerootTown";
  const header = () => `${root}/include/constants/flags.h`;
  const source = () => `${root}/data/maps/Route101/scripts.inc`;
  const mapFile = () => `${root}/data/maps/Route101/map.json`;
  const state = () => structuredClone(sessions.snapshotOf(store.open(map).session));
  const req = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const edit = (route: string, body?: unknown, name = map) => req(`/api/edit/${name}/${route}`, body);
  const npc = (label = "Route101_EventScript_PokemapObject1") => ({ kind: "object", objectType: "npc", x: 1, y: 1, fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER" },
    script: { mode: "new", label, text: "HELLO" } });
  const ball = (name: string) => ({ kind: "object", objectType: "itemball", x: 1, y: 1,
    fields: { item: "ITEM_POTION" }, flag: { mode: "new", name } });
  const create = async (form: unknown = npc()) => {
    const r = await edit("event/create", form); expect(r.status, JSON.stringify(r.body)).toBe(200); return r;
  };
  const start = async (hooks = {}) => {
    server = createServer(createProjectHandler(root, hooks).handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  beforeAll(async () => {
    sharedRoot = copyGbaAddEventProject().replace(/\\/g, "/"); root = sharedRoot;
    const copy = (part: string) => {
      mkdirSync(dirname(`${root}/${part}`), { recursive: true });
      cpSync(`${SUBJECT_ROOT}/${part}`, `${root}/${part}`, { recursive: true });
    };
    // Keep only the two maps, their block/border data, option headers, and the
    // tileset files the real tileInfo route loads. No unrelated layouts/art/src data.
    for (const part of ["data/layouts/layouts.json", "data/maps/map_groups.json", "data/maps/LittlerootTown",
      "include/fieldmap.h", "include/constants", "src/data/tilesets/headers.h", "src/data/tilesets/metatiles.h",
      "src/data/tilesets/graphics.h", "src/graphics.c"]) copy(part);
    if (existsSync(`${SUBJECT_ROOT}/porymap.project.cfg`)) copy("porymap.project.cfg");
    const project = openProject(root);
    const tilesets = parseTilesetPaths(readFileSync(project.paths.tilesetHeadersH, "utf8"),
      readFileSync(project.paths.tilesetMetatilesH, "utf8"),
      [readFileSync(project.paths.tilesetGraphicsH, "utf8"), readFileSync(project.paths.tilesetGraphicsC, "utf8")]);
    const copied = new Set<string>();
    for (const name of [map, other]) {
      const layout = project.layoutForMap(name);
      for (const part of [layout.blockdataFilepath, layout.borderFilepath]) if (!copied.has(part)) { copy(part); copied.add(part); }
      for (const symbol of [layout.primaryTileset, layout.secondaryTileset]) {
        const ts = tilesets.get(symbol)!;
        for (const part of [ts.metatilesBin, ts.attributesBin, ts.tilesPng, ...ts.palettes.map(p => p.replace(/\.gbapal$/, ".pal"))]) {
          if (!copied.has(part)) { copy(part); copied.add(part); }
        }
      }
    }
    // This data label is a read-only preview fixture for every test; create it
    // once before the shared server starts, never in a test body.
    writeFileSync(source(), readFileSync(source(), "utf8") + "\nItemBallData::\n\t.byte 1\n");
    writeFileSync(source(), readFileSync(source(), "utf8") + String.raw`
PreviewMultiText:
    .string "FI"
    .string "RST\n"
    .string "SECOND\l"
    .string "THIRD\p"
    .string "FOURTH\n"
    .string "FIFTH$"
`);
    vi.spyOn(sessions, "createEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    await start({ verifyCandidate: (candidate: any) => verifyCandidate?.(candidate) });
    sharedServer = server; sharedBase = base; sharedStore = store;
  }, 60_000);
  beforeEach(async ({ task }) => {
    verifyCandidate = undefined;
    if (diskTests.has(task.name)) {
      root = mkdtempSync(join(tmpdir(), "pokemap-gba-add-write-")).replace(/\\/g, "/");
      cpSync(sharedRoot, root, { recursive: true });
      await start();
    } else {
      root = sharedRoot; server = sharedServer; base = sharedBase; store = sharedStore;
      store.closeAll();
    }
  }, 15_000);
  afterEach(async () => {
    if (server !== sharedServer) {
      await new Promise<void>(resolve => server.close(() => resolve()));
      removeGbaTemp(root);
    }
    sharedStore?.closeAll();
    verifyCandidate = undefined;
  });
  afterAll(async () => {
    if (sharedServer) await new Promise<void>(resolve => sharedServer.close(() => resolve()));
    vi.restoreAllMocks(); if (sharedRoot) removeGbaTemp(sharedRoot);
  });
  it("map options and create share one lazy entry-point index until discard", async () => {
    const builds = vi.spyOn(entryPointBuilders, "buildEntryPointIndex");
    const reads = vi.spyOn(entryPointSources, "read");
    try {
      // Every cache test gets its own handler, so earlier tests cannot prime it.
      expect((await req("/api/event-options")).status).toBe(200);
      expect(builds).not.toHaveBeenCalled();
      expect((await req(`/api/event-options/${map}`)).status).toBe(200);
      reads.mockClear();
      expect((await req(`/api/event-options/${other}`)).status).toBe(200);
      expect(reads).not.toHaveBeenCalled();
      expect(builds).toHaveBeenCalledTimes(1);
      expect(builds).toHaveBeenLastCalledWith("gba", root);
      await create();
      expect(builds).toHaveBeenCalledTimes(1);
      expect((await edit("discard", {})).status).toBe(200);
      expect(builds).toHaveBeenCalledTimes(1);
      expect((await req(`/api/event-options/${map}`)).status).toBe(200);
      expect(builds).toHaveBeenCalledTimes(2);
    } finally { builds.mockRestore(); reads.mockRestore(); }
  }, 30_000);
  it("save rebuilds the entry-point index and exposes a newly saved reference", async () => {
    const label = "PokemapIndexSavedOnly";
    const definition = `${root}/data/maps/${other}/scripts.inc`;
    writeFileSync(definition, readFileSync(definition, "utf8") + `\n${label}::\n\tend\n`);
    const builds = vi.spyOn(entryPointBuilders, "buildEntryPointIndex");
    try {
      const before = await req(`/api/event-options/${other}`);
      expect(before.status).toBe(200); expect(before.body.entryPoints).not.toContain(label);
      const added = await edit("event/add", { kind: "bg", value: {
        type: "sign", x: 1, y: 1, elevation: 0, player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script: label,
      } });
      expect(added.status, JSON.stringify(added.body)).toBe(200);
      // Query another map to exclude the edited map's local staged overlay.
      expect((await req(`/api/event-options/${other}`)).body.entryPoints).not.toContain(label);
      expect(builds).toHaveBeenCalledTimes(1);
      const plan = (await edit("plan")).body;
      expect(plan.refusals).toEqual([]);
      expect((await edit("commit", { fingerprint: plan.fingerprint })).status).toBe(200);
      expect(builds).toHaveBeenCalledTimes(1);
      const after = await req(`/api/event-options/${other}`);
      expect(after.status).toBe(200); expect(after.body.entryPoints).toContain(label);
      expect(builds).toHaveBeenCalledTimes(2);
      expect((await req(`/api/event-options/${map}`)).status).toBe(200);
      expect(builds).toHaveBeenCalledTimes(2);
    } finally { builds.mockRestore(); }
  }, 30_000);
  it("external map references refresh immediately and discard still invalidates the index", async () => {
    const label = "PokemapIndexDiscardOnly";
    const definition = `${root}/data/maps/${other}/scripts.inc`;
    writeFileSync(definition, readFileSync(definition, "utf8") + `\n${label}::\n\tend\n`);
    const builds = vi.spyOn(entryPointBuilders, "buildEntryPointIndex");
    try {
      const before = await req(`/api/event-options/${map}`);
      expect(before.status).toBe(200); expect(before.body.entryPoints).not.toContain(label);
      const path = `${root}/data/maps/${other}/map.json`;
      const timestamp = new Date(statSync(path).mtimeMs + 2000);
      const json = JSON.parse(readFileSync(path, "utf8"));
      json.bg_events ??= [];
      json.bg_events.push({ type: "sign", x: 1, y: 1, elevation: 0, player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script: label });
      writeFileSync(path, JSON.stringify(json));
      utimesSync(path, timestamp, timestamp);
      expect((await req(`/api/event-options/${map}`)).body.entryPoints).toContain(label);
      expect(builds).toHaveBeenCalledTimes(1);
      expect((await edit("discard", {})).status).toBe(200);
      const after = await req(`/api/event-options/${map}`);
      expect(after.status).toBe(200); expect(after.body.entryPoints).toContain(label);
      expect(builds).toHaveBeenCalledTimes(2);
    } finally { builds.mockRestore(); }
  }, 30_000);
  it("external definition removal rename and addition refresh options and create without invalidation", async () => {
    const labels = ["PokemapIndexRemoved", "PokemapIndexOld", "PokemapIndexNew", "PokemapIndexAdded"];
    const refsPath = `${root}/data/maps/${other}/map.json`;
    const json = JSON.parse(readFileSync(refsPath, "utf8"));
    json.bg_events ??= [];
    for (const script of labels) json.bg_events.push({ type: "sign", x: 1, y: 1, elevation: 0, player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script });
    const refsTimestamp = new Date(statSync(refsPath).mtimeMs + 2000);
    writeFileSync(refsPath, JSON.stringify(json)); utimesSync(refsPath, refsTimestamp, refsTimestamp);
    const dir = `${root}/data/maps/${other}`, extension = ".inc";
    const removed = `${dir}/pokemap_remove${extension}`, renamed = `${dir}/pokemap_rename${extension}`, added = `${dir}/pokemap_added${extension}`;
    let timestamp = Date.now() + 2000;
    const writeDefinition = (path: string, label: string) => {
      timestamp += 2000;
      writeFileSync(path, `${label}::\n\tend\n`);
      utimesSync(path, new Date(timestamp), new Date(timestamp));
    };
    const existing = (label: string) => ({ ...npc(), script: { mode: "existing", label } });
    const entries = async () => {
      const result = await req(`/api/event-options/${map}`);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return result.body.entryPoints as string[];
    };
    writeDefinition(removed, labels[0]!); writeDefinition(renamed, labels[1]!);
    const before = await entries();
    expect(before).toContain(labels[0]); expect(before).toContain(labels[1]);
    expect(before).not.toContain(labels[2]); expect(before).not.toContain(labels[3]);
    rmSync(removed);
    // Create is the first use after the external edit, so it must refresh too.
    const removedCreate = await edit("event/create", existing(labels[0]!));
    expect(removedCreate.status).toBe(400); expect(removedCreate.body.code).toBe("BAD_OPTION");
    expect(await entries()).not.toContain(labels[0]);
    writeDefinition(renamed, labels[2]!);
    const renamedCreate = await edit("event/create", existing(labels[1]!));
    expect(renamedCreate.status).toBe(400); expect(renamedCreate.body.code).toBe("BAD_OPTION");
    const afterRename = await entries();
    expect(afterRename).not.toContain(labels[1]); expect(afterRename).toContain(labels[2]);
    writeDefinition(added, labels[3]!);
    const addedCreate = await edit("event/create", existing(labels[3]!));
    expect(addedCreate.status, JSON.stringify(addedCreate.body)).toBe(200);
    expect((await edit("undo", {})).status).toBe(200);
    const afterAdd = await entries();
    expect(afterAdd).toContain(labels[3]); expect(afterAdd).not.toContain(labels[0]);
  }, 30_000);
  it("create caches project scans and invalidation reloads them", () => {
    const index = vi.spyOn(symbolBuilders, "buildGbaSymbolIndex");
    const options = vi.spyOn(eventOptions, "loadGbaEventOptions");
    const slots = vi.spyOn(eventOptions, "freeGbaSlots");
    try {
      const project = openProject(root), isolatedStore = factory(project);
      const routes = createGbaAddEventRoutes(project, isolatedStore);
      routes.check(map); routes.freshCheck(map);
      expect(index).not.toHaveBeenCalled();
      routes.create(map, ball("FLAG_POKEMAP_CACHE_FIRST"));
      isolatedStore.open(map).stack.undo(isolatedStore.open(map).session);
      routes.create(other, ball("FLAG_POKEMAP_CACHE_SECOND"));
      expect(index).toHaveBeenCalledTimes(1); expect(options).toHaveBeenCalledTimes(1);
      expect(slots).toHaveBeenCalledTimes(1);
      routes.invalidate();
      isolatedStore.open(other).stack.undo(isolatedStore.open(other).session);
      routes.create(map, ball("FLAG_POKEMAP_CACHE_THIRD"));
      expect(index).toHaveBeenCalledTimes(2); expect(options).toHaveBeenCalledTimes(2);
      expect(slots).toHaveBeenCalledTimes(2);
    } finally { index.mockRestore(); options.mockRestore(); slots.mockRestore(); }
  });
  it("NPC create undo redo restores all metadata and undo-create reuses default 1", async () => {
    await create(); const first = state();
    expect(first.newNames).toContain("Route101_EventScript_PokemapObject1");
    await edit("undo", {}); expect(state().newNames).toEqual([]);
    expect((await edit("plan")).body.changes).toEqual([]);
    await edit("redo", {}); expect(state()).toEqual(first);
    await edit("undo", {}); await create(); expect(state()).toEqual(first);
  });
  it("two new flags accumulate exact header replacements and undo frees only the second slot", async () => {
    await create(ball("FLAG_POKEMAP_FIRST")); const first = state();
    await create(ball("FLAG_POKEMAP_SECOND")); const second = state();
    expect(second.scriptReplaces).toHaveLength(1);
    expect(second.scriptReplaces[0]!.after).toContain("FLAG_POKEMAP_FIRST");
    expect(second.scriptReplaces[0]!.after).toContain("FLAG_POKEMAP_SECOND");
    await edit("undo", {}); expect(state()).toEqual(first);
    await edit("redo", {}); expect(state()).toEqual(second);
    await edit("undo", {}); await edit("undo", {}); expect(state().scriptReplaces).toEqual([]);
  });
  it("two flags commit the exact accumulated bytes while preserving all other header lines", async () => {
    const before = readFileSync(header(), "utf8");
    await create(ball("FLAG_POKEMAP_FIRST")); await create(ball("FLAG_POKEMAP_SECOND"));
    const expected = state().scriptReplaces[0]!;
    expect(expected.before).toBe(before);
    const oldLines = before.split(/\r?\n/), newLines = expected.after.split(/\r?\n/);
    expect(newLines).toHaveLength(oldLines.length);
    const changed = oldLines.flatMap((line, i) => line === newLines[i] ? [] : [i]);
    expect(changed).toHaveLength(2);
    for (const i of changed) expect(newLines[i]!.replace(/FLAG_POKEMAP_(?:FIRST|SECOND)/, "SLOT")).toBe(oldLines[i]!.replace(/FLAG_UNUSED_\w+/, "SLOT"));
    const plan = (await edit("plan")).body; expect(plan.refusals).toEqual([]);
    expect((await edit("commit", { fingerprint: plan.fingerprint })).status).toBe(200);
    expect(readFileSync(header(), "utf8")).toBe(expected.after);
  }, 8_000);
  it("post-staging verifier sees complete candidate and failure preserves bytes and history", async () => {
    let seen = false;
    verifyCandidate = (candidate: any) => {
      seen = true; expect(candidate.newNames).toContain("Route101_EventScript_PokemapObject1");
      expect(candidate.map.objectEvents.at(-1).script).toBe("Route101_EventScript_PokemapObject1");
      expect(candidate.scriptAppends.at(-1).text).toContain("HELLO");
      throw new Error("injected verifier failure");
    };
    const before = state(), entry = store.open(map);
    const history = [entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty];
    const result = await edit("event/create", npc());
    expect(result.status).toBe(400); expect(result.body.error).toContain(map);
    expect(result.body.error).toContain("data/maps/Route101/scripts.inc"); expect(seen).toBe(true);
    expect(state()).toEqual(before);
    expect([entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty]).toEqual(history);
  });
  it("commit rebuilds symbols after plan and refuses an unrelated-file collision without writes", async () => {
    const original = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(); const plan = (await edit("plan")).body;
    expect(plan.refusals).toEqual([]);
    writeFileSync(`${root}/data/unrelated.inc`, "Route101_EventScript_PokemapObject1:\n");
    const result = await edit("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(400);
    expect(result.body.refusals.some((r: any) => r.code === "LABEL_TAKEN")).toBe(true);
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(original);
  }, 8_000);
  it("project options include an unsaved flag and remove it after undo", async () => {
    await create(ball("FLAG_POKEMAP_FIRST"));
    expect((await req("/api/event-options")).body.flags).toContain("FLAG_POKEMAP_FIRST");
    await edit("undo", {});
    expect((await req("/api/event-options")).body.flags).not.toContain("FLAG_POKEMAP_FIRST");
  });
  it("other dirty sessions reserve names including staged text without newNames metadata", async () => {
    await create(npc("SharedPokemapScript"));
    const result = await edit("event/create", npc("SharedPokemapScript"), other);
    expect(result.status).toBe(400); expect(result.body.code).toBe("LABEL_TAKEN");
    store.open(map).session.newNames = [];
    const again = await edit("event/create", npc("SharedPokemapScript"), other);
    expect(again.status).toBe(400); expect(again.body.code).toBe("LABEL_TAKEN");
  });
  it("other sessions reserve new constants from staged replacement text without name metadata", async () => {
    await create(ball("FLAG_POKEMAP_FIRST")); store.open(map).session.newNames = [];
    const result = await edit("event/create", npc("FLAG_POKEMAP_FIRST"), other);
    expect(result.status).toBe(400); expect(result.body.code).toBe("LABEL_TAKEN");
    expect(result.body.error).toContain(other);
  });
  it.each([
    null, [], {}, { ...npc(), x: -1 }, { ...npc(), x: 0.5 }, { ...npc(), fields: { sprite: 42 } },
    { ...npc(), script: { mode: "copy", label: "Bad", from: "Missing", body: 42, texts: {} } },
  ])("malformed form is refused without publishing: %j", async form => {
    const before = state(), entry = store.open(map);
    const result = await edit("event/create", form);
    expect(result.status).toBe(400); expect(result.body.error).toContain(map);
    expect(state()).toEqual(before); expect(entry.stack.canUndo()).toBe(false);
  });
  it("a new flag header has one owner until undo while existing flags remain usable", async () => {
    await create(ball("FLAG_POKEMAP_FIRST"));
    const entry = store.open(other), before = structuredClone(sessions.snapshotOf(entry.session));
    const history = [entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty];
    const result = await edit("event/create", ball("FLAG_POKEMAP_SECOND"), other);
    expect(result.status).toBe(400); expect(result.body.code).toBe("NO_FLAG_SLOT");
    expect(result.body.error).toBe(`${other}: include/constants/flags.h: ${map} has an unsaved new constant in this file; save or undo it there first`);
    expect(sessions.snapshotOf(entry.session)).toEqual(before);
    expect([entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty]).toEqual(history);
    const flags = (await req("/api/event-options")).body.flags as string[];
    const existing = flags.find(name => name !== "FLAG_POKEMAP_FIRST" && !name.includes("UNUSED"))!;
    expect(existing).toBeDefined();
    const existingBall = { ...ball(existing), flag: { mode: "existing", name: existing } };
    const allowed = await edit("event/create", existingBall, other);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    await edit("undo", {});
    const released = await edit("event/create", ball("FLAG_POKEMAP_SECOND"), other);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
  });
  it("new vars obey independent header ownership and release on undo", async () => {
    const coord = (name: string) => ({ kind: "coord", x: 1, y: 1, fields: {}, varName: { mode: "new", name },
      script: { mode: "existing", label: "Route101_EventScript_Youngster" } });
    expect((await edit("event/create", coord("VAR_POKEMAP_FIRST"))).status).toBe(200);
    const entry = store.open(other), before = structuredClone(sessions.snapshotOf(entry.session));
    const result = await edit("event/create", coord("VAR_POKEMAP_SECOND"), other);
    expect(result.status).toBe(400); expect(result.body.code).toBe("NO_VAR_SLOT");
    expect(result.body.error).toBe(`${other}: include/constants/vars.h: ${map} has an unsaved new constant in this file; save or undo it there first`);
    expect(sessions.snapshotOf(entry.session)).toEqual(before); expect(entry.stack.canUndo()).toBe(false);
    // vars.h ownership does not prevent another map owning flags.h.
    const independent = await edit("event/create", ball("FLAG_POKEMAP_INDEPENDENT"), other);
    expect(independent.status, JSON.stringify(independent.body)).toBe(200);
    await edit("undo", {});
    expect((await edit("event/create", coord("VAR_POKEMAP_SECOND"), other)).status).toBe(200);
  });
  it("saving the header owner lets another map allocate a new flag", async () => {
    await create(ball("FLAG_POKEMAP_FIRST"));
    const refused = await edit("event/create", ball("FLAG_POKEMAP_SECOND"), other);
    expect(refused.status).toBe(400); expect(refused.body.code).toBe("NO_FLAG_SLOT");
    const plan = (await edit("plan")).body; expect(plan.refusals).toEqual([]);
    expect((await edit("commit", { fingerprint: plan.fingerprint })).status).toBe(200);
    const released = await edit("event/create", ball("FLAG_POKEMAP_SECOND"), other);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    expect(store.open(other).session.scriptReplaces![0]!.before).toContain("FLAG_POKEMAP_FIRST");
  }, 8_000);
  it("map options and text previews read staged labels and one-way destination reports no return", async () => {
    await create();
    const options = await req(`/api/event-options/${map}?x=1&y=1&dest=${other}`);
    expect(options.status).toBe(200); expect(options.body.localScripts).toContain("Route101_EventScript_PokemapObject1");
    expect(options.body.entryPoints).toContain("Route101_EventScript_PokemapObject1");
    expect(options.body.returnsTo).toBe(false);
    expect(options.body.tileInfo).toMatchObject({ x: 1, y: 1, warpCapable: expect.any(Boolean) });
    const label = options.body.localTexts.find((s: string) => s.includes("Pokemap"));
    const text = await req(`/api/event-options/${map}/text?label=${label}`);
    expect(text.status).toBe(200); expect(text.body.text).toBe("HELLO");
    expect((await req(`/api/event-options/${map}/copy?label=Route101_EventScript_PokemapObject1`)).status).toBe(200);
    expect((await req(`/api/event-options/${map}/text?label=Route101_EventScript_PokemapObject1`)).body.code).toBe("COPY_NOT_SCRIPT");
  });
  it("copy preview refuses an itemball data label", async () => {
    const result = await req(`/api/event-options/${map}/copy?label=ItemBallData`);
    expect(result.status).toBe(400); expect(result.body.code).toBe("COPY_NOT_SCRIPT");
    expect(result.body.error).toContain(map); expect(result.body.error).toContain("data/maps/Route101/scripts.inc");
  });
  it("plan rebuilds symbols and refuses a definition added after create", async () => {
    const before = [source(), mapFile(), header()].map(path => readFileSync(path, "utf8"));
    await create();
    writeFileSync(`${root}/data/unrelated-plan.inc`, "Route101_EventScript_PokemapObject1:\n");
    const plan = await edit("plan"); expect(plan.status).toBe(200);
    expect(plan.body.refusals.some((r: any) => r.code === "LABEL_TAKEN")).toBe(true);
    expect(plan.body.fingerprint).toBeNull();
    expect([source(), mapFile(), header()].map(path => readFileSync(path, "utf8"))).toEqual(before);
  }, 8_000);
  it("discard refreshes project options free slots and symbols after a disk header edit", async () => {
    state();
    expect((await req("/api/event-options")).body.flags).not.toContain("FLAG_POKEMAP_EXTERNAL");
    // Prime free slots as well as the create-time symbol and options caches.
    await create(ball("FLAG_POKEMAP_PRIME")); await edit("undo", {});
    const original = readFileSync(header(), "utf8"), used = eventOptions.freeGbaSlots(root, "FLAG");
    const replacementSlot = "FLAG_UNUSED_POKEMAP_DISCARD"; expect(used.length).toBeGreaterThan(1);
    let changed = original;
    for (const [i, slot] of used.entries()) changed = changed.replace(new RegExp(`\\b${slot}\\b`, "g"), i === 0 ? replacementSlot : `FLAG_POKEMAP_EXTERNAL_${i}`);
    writeFileSync(header(), changed + "\n#define FLAG_POKEMAP_EXTERNAL 0x7FFF\n");
    await create(); await edit("discard", {});
    expect((await req("/api/event-options")).body.flags).toContain("FLAG_POKEMAP_EXTERNAL");
    const collision = await edit("event/create", npc("FLAG_POKEMAP_EXTERNAL"));
    expect(collision.status).toBe(400); expect(collision.body.code).toBe("LABEL_TAKEN");
    const next = await edit("event/create", ball("FLAG_POKEMAP_AFTER_DISCARD"));
    expect(next.status, JSON.stringify(next.body)).toBe(200);
    const replacement = store.open(map).session.scriptReplaces![0]!;
    expect(replacement.after).not.toMatch(new RegExp(`^#define[ \t]+${replacementSlot}\\b`, "m"));
    expect(replacement.after).toContain("FLAG_POKEMAP_AFTER_DISCARD");
  }, 8_000);
  it("text preview round-trips GBA fragments with line and paragraph controls", async () => {
    const preview = await req(`/api/event-options/${map}/text?label=PreviewMultiText`);
    expect(preview.status).toBe(200); expect(preview.body.text).toBe("FIRST\nSECOND\nTHIRD\n\nFOURTH\nFIFTH");
    const form = npc("PreviewRoundTrip"); form.script.text = preview.body.text;
    await create(form);
    const emitted = copyGbaScriptBody(store.open(map).session.scriptAppends!.at(-1)!.text, "PreviewRoundTrip").texts.PreviewRoundTrip_Text!;
    const structure = (raw: string) => [...raw.matchAll(/\.string\s+"([^"\r\n]*)"/g)].map(m => m[1]!).join("").replace(/\$$/, "").split("\\p").map(p => p.split(/\\[nl]/));
    const rawSource = readFileSync(source(), "utf8").split("PreviewMultiText:")[1]!;
    expect(structure(emitted)).toEqual(structure(rawSource));
    expect(structure(emitted)).toEqual([["FIRST", "SECOND", "THIRD"], ["FOURTH", "FIFTH"]]);
  });
  it("discard after create leaves all files byte-identical", async () => {
    const before = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(ball("FLAG_POKEMAP_FIRST")); await edit("discard", {});
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(before);
    expect((await req("/api/event-options")).body.flags).not.toContain("FLAG_POKEMAP_FIRST");
  });
});
