import { constCounter } from "@pokemap/core/src/gbc/load/constCounter.js";
import { copyGbcScriptBody } from "@pokemap/core/src/addEvent/gbcCopy.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync, rmSync, statSync, utimesSync, cpSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { createGbcAddEventRoutes } from "../src/addEventRoutes.js";
import * as eventOptions from "@pokemap/core/src/addEvent/gbcOptions.js";
import * as symbolBuilders from "@pokemap/core/src/defects/symbols.js";
import * as entryPointBuilders from "@pokemap/core/src/addEvent/entryPoints.js";
import * as entryPointSources from "@pokemap/core/src/addEvent/sources.js";
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
    for (const ending of ["done", "prompt"]) writeFileSync(source(), readFileSync(source(), "utf8") + `
PreviewMulti${ending}Text:
    text "FIRST"
    line "SECOND"
    cont "THIRD"
    para "FOURTH"
    line "FIFTH"
    ${ending}
`);
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
      expect(builds).toHaveBeenLastCalledWith("gbc", root);
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
    const definition = `${root}/home/pokemap_index.asm`;
    writeFileSync(definition, `${label}::\n\tend\n`);
    const builds = vi.spyOn(entryPointBuilders, "buildEntryPointIndex");
    try {
      const before = await req(`/api/event-options/${other}`);
      expect(before.status).toBe(200); expect(before.body.entryPoints).not.toContain(label);
      const added = await edit("event/add", { kind: "bg", args: ["1", "1", "BGEVENT_READ", label] });
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
    const definition = `${root}/home/pokemap_index.asm`;
    writeFileSync(definition, `${label}::\n\tend\n`);
    const builds = vi.spyOn(entryPointBuilders, "buildEntryPointIndex");
    try {
      const before = await req(`/api/event-options/${map}`);
      expect(before.status).toBe(200); expect(before.body.entryPoints).not.toContain(label);
      const path = `${root}/maps/${other}.asm`;
      const timestamp = new Date(statSync(path).mtimeMs + 2000);
      writeFileSync(path, readFileSync(path, "utf8") + `\n\tbg_event 1, 1, BGEVENT_READ, ${label}\n`);
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
    const refsPath = `${root}/maps/${other}.asm`;
    const refsTimestamp = new Date(statSync(refsPath).mtimeMs + 2000);
    writeFileSync(refsPath, readFileSync(refsPath, "utf8") + labels.map(label => `\n\tbg_event 1, 1, BGEVENT_READ, ${label}\n`).join(""));
    utimesSync(refsPath, refsTimestamp, refsTimestamp);
    const dir = `${root}/home`, extension = ".asm";
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
    const index = vi.spyOn(symbolBuilders, "buildGbcSymbolIndex");
    const options = vi.spyOn(eventOptions, "loadGbcEventOptions");
    try {
      const project = openGbcProject(root), isolatedStore = factory(project);
      const routes = createGbcAddEventRoutes(project, isolatedStore);
      routes.check(map); routes.freshCheck(map);
      expect(index).not.toHaveBeenCalled();
      routes.create(map, ball("EVENT_POKEMAP_CACHE_FIRST"));
      isolatedStore.open(map).stack.undo(isolatedStore.open(map).session);
      routes.create(other, ball("EVENT_POKEMAP_CACHE_SECOND"));
      expect(index).toHaveBeenCalledTimes(1); expect(options).toHaveBeenCalledTimes(1);
      routes.invalidate();
      isolatedStore.open(other).stack.undo(isolatedStore.open(other).session);
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
  it("unsaved flag options belong only to the owning map and disappear after undo", async () => {
    await create(ball("EVENT_POKEMAP_FIRST"));
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_FIRST");
    expect((await req(`/api/event-options/${map}`)).body.stagedFlags).toContain("EVENT_POKEMAP_FIRST");
    await edit("undo", {});
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_FIRST");
    expect((await req(`/api/event-options/${map}`)).body.stagedFlags).not.toContain("EVENT_POKEMAP_FIRST");
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
    const result = await edit("event/create", npc("EVENT_POKEMAP_FIRST"), other);
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
    await create(ball("EVENT_POKEMAP_FIRST"));
    const entry = store.open(other), before = structuredClone(sessions.gbcSnapshotOf(entry.session));
    const history = [entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty];
    const result = await edit("event/create", ball("EVENT_POKEMAP_SECOND"), other);
    expect(result.status).toBe(400); expect(result.body.code).toBe("NO_FLAG_SLOT");
    expect(result.body.error).toBe(`${other}: constants/event_flags.asm: ${map} has an unsaved new constant in this file; save or undo it there first`);
    expect(sessions.gbcSnapshotOf(entry.session)).toEqual(before);
    expect([entry.stack.canUndo(), entry.stack.canRedo(), entry.session.isDirty]).toEqual(history);
    const flags = (await req("/api/event-options")).body.flags as string[];
    const existing = flags.find(name => name !== "EVENT_POKEMAP_FIRST" && !name.includes("UNUSED"))!;
    expect(existing).toBeDefined();
    const existingBall = { ...ball(existing), flag: { mode: "existing", name: existing } };
    const allowed = await edit("event/create", existingBall, other);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    await edit("undo", {});
    const released = await edit("event/create", ball("EVENT_POKEMAP_SECOND"), other);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
  });
  it("saving the header owner lets another map allocate a new flag", async () => {
    await create(ball("EVENT_POKEMAP_FIRST"));
    const refused = await edit("event/create", ball("EVENT_POKEMAP_SECOND"), other);
    expect(refused.status).toBe(400); expect(refused.body.code).toBe("NO_FLAG_SLOT");
    const plan = (await edit("plan")).body; expect(plan.refusals).toEqual([]);
    expect((await edit("commit", { fingerprint: plan.fingerprint })).status).toBe(200);
    const released = await edit("event/create", ball("EVENT_POKEMAP_SECOND"), other);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    const a = constCounter(readFileSync(header(), "utf8")).find(c => c.name === "EVENT_POKEMAP_FIRST")!;
    const b = constCounter(store.open(other).session.constEdits![0]!.after).find(c => c.name === "EVENT_POKEMAP_SECOND")!;
    expect(a).toBeDefined(); expect(b).toBeDefined(); expect(b.value).not.toBe(a.value);
  }, 8_000);
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
  it("plan rebuilds symbols and refuses a definition added after create", async () => {
    const before = [source(), mapFile(), header()].map(path => readFileSync(path, "utf8"));
    await create();
    writeFileSync(`${root}/maps/UnrelatedPlan.asm`, "Route29PokemapObject1:\n");
    const plan = await edit("plan"); expect(plan.status).toBe(200);
    expect(plan.body.refusals.some((r: any) => r.code === "LABEL_TAKEN")).toBe(true);
    expect(plan.body.fingerprint).toBeNull();
    expect([source(), mapFile(), header()].map(path => readFileSync(path, "utf8"))).toEqual(before);
  }, 8_000);
  it("discard refreshes project options free slots and symbols after a disk header edit", async () => {
    state();
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_EXTERNAL");
    // Prime free slots as well as the create-time symbol and options caches.
    await create(ball("EVENT_POKEMAP_PRIME")); await edit("undo", {});
    const before = readFileSync(header(), "utf8"), last = constCounter(before).filter(c => c.name.startsWith("EVENT_")).at(-1)!;
    const lines = before.split(/\r?\n/); lines.splice(last.line + 1, 0, "\tconst EVENT_POKEMAP_EXTERNAL");
    writeFileSync(header(), lines.join(before.includes("\r\n") ? "\r\n" : "\n"));
    await create(); await edit("discard", {});
    expect((await req("/api/event-options")).body.flags).toContain("EVENT_POKEMAP_EXTERNAL");
    const collision = await edit("event/create", npc("EVENT_POKEMAP_EXTERNAL"));
    expect(collision.status).toBe(400); expect(collision.body.code).toBe("LABEL_TAKEN");

  }, 8_000);
  it.each(["done", "prompt"])("text preview round-trips GBC line cont and para structure ending in %s", async ending => {
    const label = `PreviewMulti${ending}Text`;
    const preview = await req(`/api/event-options/${map}/text?label=${label}`);
    expect(preview.status).toBe(200); expect(preview.body.text).toBe("FIRST\nSECOND\nTHIRD\n\nFOURTH\nFIFTH");
    const form = npc("PreviewRoundTrip"); form.script.text = preview.body.text;
    await create(form);
    const emitted = copyGbcScriptBody(store.open(map).session.eventsText, "PreviewRoundTrip").texts.PreviewRoundTripText!;
    const rawSource = readFileSync(source(), "utf8").split(`${label}:`)[1]!.split(/\r?\n\s*(?:done|prompt)\s*(?:\r?\n|$)/)[0]!;
    const structure = (raw: string) => raw.split(/\r?\n/).filter(line => /^\s*(?:text|line|cont|para)\s/.test(line)).map(line => line.trim());
    expect(structure(emitted)).toEqual(structure(rawSource));
    expect(structure(emitted)).toEqual(['text "FIRST"', 'line "SECOND"', 'cont "THIRD"', 'para "FOURTH"', 'line "FIFTH"']);
  });
  it("discard after create leaves all files byte-identical", async () => {
    const before = [source(), mapFile(), header()].map(p => readFileSync(p, "utf8"));
    await create(ball("EVENT_POKEMAP_FIRST")); await edit("discard", {});
    expect([source(), mapFile(), header()].map(p => readFileSync(p, "utf8"))).toEqual(before);
    expect((await req("/api/event-options")).body.flags).not.toContain("EVENT_POKEMAP_FIRST");
  });

  it("unsaved Existing flags belong only to their own session", async () => {
    const name = "EVENT_POKEMAP_LOCAL_OPTIONS";
    await create(ball(name));
    expect((await req("/api/event-options")).body.flags).not.toContain(name);
    expect((await req(`/api/event-options/${map}`)).body.stagedFlags).toContain(name);
    expect((await req(`/api/event-options/${other}`)).body.stagedFlags).not.toContain(name);
    const existing = { ...npc(), flag: { mode: "existing", name }, script: { mode: "existing", label: "ObjectEvent" } };
    const before = structuredClone(sessions.gbcSnapshotOf(store.open(other).session));
    const refused = await edit("event/create", existing, other);
    expect(refused.status).toBe(400); expect(refused.body.code).toBe("BAD_OPTION");
    expect(sessions.gbcSnapshotOf(store.open(other).session)).toEqual(before);
    const own = await edit("event/create", existing);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
  });
  it("redo checks header ownership without consuming history", async () => {
    await create(ball("EVENT_POKEMAP_REDO_A")); const applied = state();
    expect((await edit("undo", {})).status).toBe(200); const before = state();
    const b = await edit("event/create", ball("EVENT_POKEMAP_REDO_B"), other);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    const createRefusal = await edit("event/create", ball("EVENT_POKEMAP_REDO_C"));
    const redoRefusal = await edit("redo", {});
    expect(redoRefusal.status).toBe(400); expect(redoRefusal.body).toEqual(createRefusal.body);
    expect(redoRefusal.body.code).toBe("NO_FLAG_SLOT"); expect(state()).toEqual(before);
    expect(store.open(map).stack.canRedo()).toBe(true); expect(store.open(map).stack.canUndo()).toBe(false);
    expect((await edit("undo", {}, other)).status).toBe(200);
    expect((await edit("redo", {})).status).toBe(200); expect(state()).toEqual(applied);
  });
  it("warp create refuses an index beyond the staged destination warp count", async () => {
    const target = store.open(other).session;
    const originalCount = target.events.warps.length;
    const staged = await edit("event/add", { kind: "warp", args: ["1", "1", target.map.constName, "-1"] }, other);
    expect(staged.status, JSON.stringify(staged.body)).toBe(200);
    const count = target.events.warps.length;
    expect(count).toBe(originalCount + 1);
    const allowed = await edit("event/create", { kind: "warp", x: 1, y: 1, fields: { destMap: target.map.constName, destWarp: String(count) } });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect((await edit("undo", {})).status).toBe(200);
    const before = state();
    const result = await edit("event/create", { kind: "warp", x: 1, y: 1, fields: { destMap: target.map.constName, destWarp: String(count + 1) } });
    expect(result.status).toBe(400); expect(result.body.code).toBe("BAD_OPTION");
    expect(result.body.error).toContain(target.map.constName); expect(state()).toEqual(before);
  });
});
