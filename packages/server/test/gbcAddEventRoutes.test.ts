import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync, cpSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { createGbcAddEventRoutes } from "../src/addEventRoutes.js";
import * as eventOptions from "@pokemap/core/src/addEvent/gbcOptions.js";
import * as symbolBuilders from "@pokemap/core/src/defects/symbols.js";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import * as sessions from "../src/gbcEditSessions.js";
import { copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT } from "@pokemap/core/test/gbc/helpers/corpus.js";

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC add-event routes over a temporary project", () => {
  let root: string, server: Server, base: string;
  let sharedRoot: string, sharedServer: Server, sharedBase: string;
  let sharedStore: typeof store;
  let verifyCandidate: ((candidate: any) => void) | undefined;
  const diskTests = new Set([
    "two flags commit the exact accumulated bytes while preserving all other header lines",
    "commit rebuilds symbols after plan and refuses an unrelated-file collision without writes",
  ]);
  let store: ReturnType<typeof sessions.createGbcEditSessionStore>;
  const factory = sessions.createGbcEditSessionStore;
  const map = "Route29", other = "Route30";
  const header = () => `${root}/constants/event_flags.asm`;
  const source = () => `${root}/maps/Route29.asm`;
  const mapFile = () => `${root}/maps/Route29.asm`;
  const state = () => structuredClone(sessions.gbcSnapshotOf(store.open(map).session));
  const req = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const edit = (route: string, body?: unknown, name = map) => req(`/api/edit/${name}/${route}`, body);
  const npc = (label = "Route29PokemapObject1") => ({ kind: "object", objectType: "npc", x: 1, y: 1, fields: { sprite: "SPRITE_YOUNGSTER" },
    script: { mode: "new", label, text: "HELLO" } });
  const ball = (name: string) => ({ kind: "object", objectType: "itemball", x: 1, y: 1,
    fields: { item: "POTION" }, flag: { mode: "new", name } });
  const create = async (form: unknown = npc()) => {
    const r = await edit("event/create", form); expect(r.status, JSON.stringify(r.body)).toBe(200); return r;
  };
  const start = async (hooks = {}) => {
    server = createServer(createGbcProjectHandler(root, hooks).handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  beforeAll(async () => {
    sharedRoot = copyGbcSubjectToTemp().replace(/\\/g, "/"); root = sharedRoot;
    // This data label is a read-only preview fixture for every test; create it
    // once before the shared server starts, never in a test body.
    writeFileSync(source(), readFileSync(source(), "utf8") + "\nItemBallData:\n\titemball POTION\n");
    vi.spyOn(sessions, "createGbcEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    await start({ verifyCandidate: (candidate: any) => verifyCandidate?.(candidate) });
    sharedServer = server; sharedBase = base; sharedStore = store;
  }, 60_000);
  beforeEach(async ({ task }) => {
    verifyCandidate = undefined;
    if (diskTests.has(task.name)) {
      root = mkdtempSync(join(tmpdir(), "pokemap-gbc-add-write-")).replace(/\\/g, "/");
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
      removeTemp(root);
    }
    sharedStore?.closeAll();
    verifyCandidate = undefined;
  });
  afterAll(async () => {
    if (sharedServer) await new Promise<void>(resolve => sharedServer.close(() => resolve()));
    vi.restoreAllMocks(); if (sharedRoot) removeTemp(sharedRoot);
  });
  it("create caches project scans and invalidation reloads them", () => {
    const index = vi.spyOn(symbolBuilders, "buildGbcSymbolIndex");
    const options = vi.spyOn(eventOptions, "loadGbcEventOptions");
    try {
      const project = openGbcProject(root), isolatedStore = factory(project);
      const routes = createGbcAddEventRoutes(project, isolatedStore);
      routes.check(map); routes.freshCheck(map);
      expect(index).not.toHaveBeenCalled();
      routes.create(map, ball("EVENT_POKEMAP_CACHE_FIRST"));
      routes.create(other, ball("EVENT_POKEMAP_CACHE_SECOND"));
      expect(index).toHaveBeenCalledTimes(1); expect(options).toHaveBeenCalledTimes(1);
      routes.invalidate();
      routes.create(map, ball("EVENT_POKEMAP_CACHE_THIRD"));
      expect(index).toHaveBeenCalledTimes(2); expect(options).toHaveBeenCalledTimes(2);
    } finally { index.mockRestore(); options.mockRestore(); }
  });
  it("NPC create undo redo restores all metadata and undo-create reuses default 1", async () => {
    await create(); const first = state();
    expect(first.newNames).toContain("Route29PokemapObject1");
    await edit("undo", {}); expect(state().newNames).toEqual([]);
    expect((await edit("plan")).body.changes).toEqual([]);
    await edit("redo", {}); expect(state()).toEqual(first);
    await edit("undo", {}); await create(); expect(state()).toEqual(first);
  });
  it("two new flags accumulate exact header replacements and undo frees only the second slot", async () => {
    await create(ball("EVENT_POKEMAP_FIRST")); const first = state();
    await create(ball("EVENT_POKEMAP_SECOND")); const second = state();
    expect(second.constEdits).toHaveLength(1);
    expect(second.constEdits[0]!.after).toContain("EVENT_POKEMAP_FIRST");
    expect(second.constEdits[0]!.after).toContain("EVENT_POKEMAP_SECOND");
    await edit("undo", {}); expect(state()).toEqual(first);
    await edit("redo", {}); expect(state()).toEqual(second);
    await edit("undo", {}); await edit("undo", {}); expect(state().constEdits).toEqual([]);
  });
  it("two flags commit the exact accumulated bytes while preserving all other header lines", async () => {
    const before = readFileSync(header(), "utf8");
    await create(ball("EVENT_POKEMAP_FIRST")); await create(ball("EVENT_POKEMAP_SECOND"));
    const expected = state().constEdits[0]!;
    expect(expected.before).toBe(before);
    expect(expected.after.replace(/^[ \t]*const EVENT_POKEMAP_(?:FIRST|SECOND)[^\r\n]*\r?\n/gm, "")).toBe(before);
    const plan = (await edit("plan")).body; expect(plan.refusals).toEqual([]);
    expect((await edit("commit", { fingerprint: plan.fingerprint })).status).toBe(200);
    expect(readFileSync(header(), "utf8")).toBe(expected.after);
  }, 8_000);
  it("post-staging verifier sees complete candidate and failure preserves bytes and history", async () => {
    let seen = false;
    verifyCandidate = (candidate: any) => {
      seen = true; expect(candidate.newNames).toContain("Route29PokemapObject1");
      expect(candidate.events.objects.at(-1).script).toBe("Route29PokemapObject1");
      expect(candidate.eventsText).toContain("HELLO");
      throw new Error("injected verifier failure");
    };
    const before = state(), entry = store.open(map);
    const history = [entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty];
    const result = await edit("event/create", npc());
    expect(result.status).toBe(400); expect(result.body.error).toContain(map);
    expect(result.body.error).toContain("maps/Route29.asm"); expect(seen).toBe(true);
    expect(state()).toEqual(before);
    expect([entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty]).toEqual(history);
  });
  it("commit rebuilds symbols after plan and refuses an unrelated-file collision without writes", async () => {
    const original = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(); const plan = (await edit("plan")).body;
    expect(plan.refusals).toEqual([]);
    writeFileSync(`${root}/maps/Unrelated.asm`, "Route29PokemapObject1:\n");
    const result = await edit("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(400);
    expect(result.body.refusals.some((r: any) => r.code === "LABEL_TAKEN")).toBe(true);
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(original);
  }, 8_000);
  it("project options include an unsaved flag and remove it after undo", async () => {
    await create(ball("EVENT_POKEMAP_FIRST"));
    expect((await req("/api/event-options")).body.flags).toContain("EVENT_POKEMAP_FIRST");
    await edit("undo", {});
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_FIRST");
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
    await create(ball("EVENT_POKEMAP_FIRST")); store.open(map).session.newNames = [];
    const result = await edit("event/create", ball("EVENT_POKEMAP_FIRST"), other);
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
    await create(ball("EVENT_POKEMAP_FIRST"));
    const result = await edit("event/create", ball("EVENT_POKEMAP_SECOND"), other);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const a = store.open(map).session.constEdits![0]!, b = store.open(other).session.constEdits![0]!;
    expect(a.after).not.toContain("EVENT_POKEMAP_SECOND"); expect(b.after).not.toContain("EVENT_POKEMAP_FIRST");
  });
  it("map options and text previews read staged labels and one-way destination reports no return", async () => {
    await create();
    const options = await req(`/api/event-options/${map}?x=1&y=1&dest=Route31`);
    expect(options.status).toBe(200); expect(options.body.localScripts).toContain("Route29PokemapObject1");
    expect(options.body.entryPoints).toContain("Route29PokemapObject1");
    expect(options.body.returnsTo).toBe(false);
    expect(options.body.tileInfo).toMatchObject({ x: 1, y: 1, warpCapable: expect.any(Boolean) });
    const label = options.body.localTexts.find((s: string) => s.includes("Pokemap"));
    const text = await req(`/api/event-options/${map}/text?label=${label}`);
    expect(text.status).toBe(200); expect(text.body.text).toBe("HELLO");
    expect((await req(`/api/event-options/${map}/copy?label=Route29PokemapObject1`)).status).toBe(200);
    expect((await req(`/api/event-options/${map}/text?label=Route29PokemapObject1`)).body.code).toBe("COPY_NOT_SCRIPT");
  });
  it("copy preview refuses an itemball data label", async () => {
    const result = await req(`/api/event-options/${map}/copy?label=ItemBallData`);
    expect(result.status).toBe(400); expect(result.body.code).toBe("COPY_NOT_SCRIPT");
    expect(result.body.error).toContain(map); expect(result.body.error).toContain("maps/Route29.asm");
  });
  it("discard after create leaves all files byte-identical", async () => {
    const before = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(ball("EVENT_POKEMAP_FIRST")); await edit("discard", {});
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(before);
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_FIRST");
  });
});
