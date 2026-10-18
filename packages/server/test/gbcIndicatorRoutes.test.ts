import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import * as sessions from "../src/gbcEditSessions.js";
import { copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT } from "@pokemap/core/test/gbc/helpers/corpus.js";
import { insertGbcIndicator } from "@pokemap/core/src/indicator/gbc.js";

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC Indicator routes", () => {
  let root: string, server: Server, base: string, original: string;
  let store: ReturnType<typeof sessions.createGbcEditSessionStore>;
  const factory = sessions.createGbcEditSessionStore;
  const path = () => `${root}/maps/Route29.asm`;
  const disk = () => readFileSync(path(), "utf8");
  const req = async (route: string, body?: unknown) => {
    const r = await fetch(`${base}/api/edit/Route29/${route}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const add = (species = "SENTRET", text = "HELLO") => req("indicator/add", { x: 1, y: 1, species, text });
  const state = () => structuredClone(sessions.gbcSnapshotOf(store.open("Route29").session));
  const index = () => store.open("Route29").session.events.objects.length - 1;
  const update = (extra = {}) => req("indicator/update", { index: index(), scriptLabel: "Route29PokemonIndicator1", species: "GEODUDE", text: "HELLO", ...extra });
  beforeEach(async () => {
    root = copyGbcSubjectToTemp(); original = disk();
    vi.spyOn(sessions, "createGbcEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    server = createServer(createGbcProjectHandler(root).handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    vi.restoreAllMocks(); if (root) removeTemp(root);
  });
  it("suggestions expose IndicatorSpecies and old add is gone", async () => {
    const r = await fetch(`${base}/api/indicator/Route29/suggestions`); expect(r.status).toBe(200);
    const body = await r.json() as any; expect(body.species.length).toBeGreaterThan(0);
    for (const item of body.species) expect(item).toEqual({ species: expect.any(String), name: expect.any(String), percent: expect.any(Number) });
    expect(body).toHaveProperty("placement"); expect((await req("sign/add", {})).status).toBe(404);
  });
  it.each(["\n", "\r\n"])("add stages exactly Task 3 bytes and commit matches plan (%j)", async eol => {
    const before = original.replace(/\r?\n/g, eol).replace(/(?:\r?\n)+$/, ""); writeFileSync(path(), before);
    const expected = insertGbcIndicator(before, "Route29", { x: 1, y: 1, species: "SENTRET", sprite: "SPRITE_MONSTER", paragraphs: [["HELLO"]] });
    const r = await add(); expect(r.status).toBe(200); expect(r.body.scriptLabel).toBe(expected.scriptLabel);
    expect(state().eventsText).toBe(expected.text); expect(disk()).toBe(before);
    const plan = (await req("plan")).body; expect(plan.refusals).toEqual([]); expect(plan.changes).toHaveLength(1);
    expect((await req("commit", {})).status).toBe(200); expect(disk()).toBe(expected.text);
  });
  it("Place -> Update -> undo x2 -> redo x2 restores full eventsText and parsed events", async () => {
    const before = state(); expect((await add()).status).toBe(200); const placed = state();
    expect((await update()).status).toBe(200); const updated = state();
    expect(updated.eventsText).toBe(placed.eventsText.replace("\tcry SENTRET", "\tcry GEODUDE").replace(/(object_event[^\r\n]*)SPRITE_MONSTER/, "$1SPRITE_GEODUDE"));
    expect((await req(`indicator/at?index=${index()}`)).body.indicator).toMatchObject({ editable: true, species: "GEODUDE", text: "HELLO" });
    await req("undo", {}); expect(state()).toEqual(placed);
    await req("undo", {}); expect(state()).toEqual(before); expect((await req("plan")).body.changes).toEqual([]);
    await req("redo", {}); expect(state()).toEqual(placed);
    await req("redo", {}); expect(state()).toEqual(updated);
    expect((await req("plan")).body.refusals).toEqual([]);
    expect((await req("commit", {})).status).toBe(200); expect(disk()).toBe(updated.eventsText);
    expect((await update()).status).toBe(200); expect((await req("plan")).body.changes).toEqual([]);
  });
  it("same species gets two labels and unchanged update pushes no command", async () => {
    await add(); const placed = state(); expect((await update({ species: "SENTRET" })).status).toBe(200); expect(state()).toEqual(placed);
    expect((await add()).body.scriptLabel).toBe("Route29PokemonIndicator2");
    await req("undo", {}); expect(state()).toEqual(placed);
    await req("undo", {}); expect((await req("plan")).body.changes).toEqual([]);
  });
  it.each(["add", "update"])("%s missing charmap refuses without changing session or undo", async op => {
    await add(); const before = state(); unlinkSync(`${root}/constants/charmap.asm`);
    const r = op === "add" ? await add() : await update(); expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.refusals)).toContain("charmap.asm"); expect(state()).toEqual(before);
    await req("undo", {}); expect(state().eventsText).toBe(original);
  });
  it.each(["constants/sprite_constants.asm", "data/pokemon/names.asm"])("missing %s refuses with its file and leaves undo untouched", async file => {
    const before = state(); unlinkSync(`${root}/${file}`);
    const r = await add(); expect(r.status).toBe(400); expect(JSON.stringify(r.body.refusals)).toContain(file.split("/").at(-1));
    expect(state()).toEqual(before); expect(store.open("Route29").stack.canUndo()).toBe(false);
  });
  it("stale label, unknown species, wrap failure and hand-changed scripts refuse atomically", async () => {
    await add(); const before = state();
    for (const extra of [{ scriptLabel: "Stale" }, { species: "BOGUS" }, { text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }]) {
      const r = await update(extra); expect(r.status).toBe(400); expect(r.body.refusals.length).toBeGreaterThan(0); expect(state()).toEqual(before);
    }
    const entry = store.open("Route29"); entry.session.eventsText = entry.session.eventsText.replace("\tcry SENTRET", "\tcry SENTRET\n\tend");
    const changed = state(); expect((await req(`indicator/at?index=${index()}`)).body.indicator.editable).toBe(false);
    expect((await update()).status).toBe(400); expect(state()).toEqual(changed);
  });
});
