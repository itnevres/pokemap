import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { openProject } from "@pokemap/core/src/project.js";
import { parseTilesetPaths } from "@pokemap/core/src/load/tilesets.js";
import { createGbaAddEventRoutes } from "../src/addEventRoutes.js";
import * as eventOptions from "@pokemap/core/src/addEvent/gbaOptions.js";
import * as symbolBuilders from "@pokemap/core/src/defects/symbols.js";
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
    "two flags commit the exact accumulated bytes while preserving all other header lines",
    "commit rebuilds symbols after plan and refuses an unrelated-file collision without writes",
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
      routes.create(other, ball("FLAG_POKEMAP_CACHE_SECOND"));
      expect(index).toHaveBeenCalledTimes(1); expect(options).toHaveBeenCalledTimes(1);
      expect(slots).toHaveBeenCalledTimes(1);
      routes.invalidate();
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
    const result = await edit("event/create", ball("FLAG_POKEMAP_FIRST"), other);
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
  it("two maps creating new flags reserve different free slots", async () => {
    await create(ball("FLAG_POKEMAP_FIRST"));
    const result = await edit("event/create", ball("FLAG_POKEMAP_SECOND"), other);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const a = store.open(map).session.scriptReplaces![0]!, b = store.open(other).session.scriptReplaces![0]!;
    const removed = (edit: typeof a) => edit.before.split(/\r?\n/).filter(line => !edit.after.split(/\r?\n/).includes(line));
    expect(removed(a)).toHaveLength(1); expect(removed(b)).toHaveLength(1); expect(removed(a)).not.toEqual(removed(b));
    await edit("undo", {});
    expect((await edit("event/create", ball("FLAG_POKEMAP_THIRD"), other)).status).toBe(200);
    expect(removed(store.open(other).session.scriptReplaces![0]!)).toContain(removed(a)[0]);
  });
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
  it("discard after create leaves all files byte-identical", async () => {
    const before = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(ball("FLAG_POKEMAP_FIRST")); await edit("discard", {});
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(before);
    expect((await req("/api/event-options")).body.flags).not.toContain("FLAG_POKEMAP_FIRST");
  });
});
