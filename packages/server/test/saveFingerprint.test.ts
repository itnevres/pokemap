import * as saves from "@pokemap/core/src/write/save.js";
import * as symbolIndex from "@pokemap/core/src/defects/symbols.js";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { openProject } from "@pokemap/core/src/project.js";
import * as sessions from "../src/editSessions.js";

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA preview-bound saves (temporary subject copy)", () => {
  let root: string, server: PokemapServer, base: string;
  let store: ReturnType<typeof sessions.createEditSessionStore>;
  const factory = sessions.createEditSessionStore;
  const map = "Route101", scriptSuffix = "scripts.inc";
  const json = () => `${root}/data/maps/${map}/map.json`;
  const scripts = () => `${root}/data/maps/${map}/scripts.inc`;
  const blocks = () => `${root}/${openProject(root).layoutForMap(map).blockdataFilepath}`;
  const targets = () => [json(), scripts(), blocks()];
  const changeLinkedSource = () => {
    const path = `${root}/src/data/region_map/region_map_entries.h`;
    const before = readFileSync(path, "utf8"), after = before.replace('_("ROUTE 101")', '_("NEW ROUTE")');
    expect(after).not.toBe(before);
    writeFileSync(path, after);
  };
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-gba-fingerprint-")).replace(/\\/g, "/");
    for (const part of ["data/layouts", "data/maps/Route101", "data/tilesets", "graphics/tilesets", "include", "src/data", "src/graphics.c", "charmap.txt", "porymap.project.cfg"]) {
      if (!existsSync(`${SUBJECT_ROOT}/${part}`)) continue;
      mkdirSync(dirname(`${root}/${part}`), { recursive: true });
      cpSync(`${SUBJECT_ROOT}/${part}`, `${root}/${part}`, { recursive: true });
    }
    cpSync(`${SUBJECT_ROOT}/data/maps/map_groups.json`, `${root}/data/maps/map_groups.json`);
    vi.spyOn(sessions, "createEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    server = await createServer({ projectPath: root, port: 0 });
    base = `http://127.0.0.1:${server.port}`;
  }, 300_000);
  afterEach(async () => {
    await server?.close();
    vi.restoreAllMocks();
    if (root) {
      const target = resolve(root);
      if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes("pokemap-gba-fingerprint-")) throw new Error("unsafe temporary path");
      rmSync(target, { recursive: true, force: true });
    }
  });

  const request = async (route: string, body?: unknown) => {
    const response = await fetch(`${base}/api/edit/${map}/${route}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const rawCommit = async (body?: string) => {
    const response = await fetch(`${base}/api/edit/${map}/commit`, { method: "POST", body });
    return { status: response.status, body: await response.json() as any };
  };
  const preview = async () => {
    const result = await request("plan");
    expect(result.status).toBe(200);
    expect(result.body.refusals).toEqual([]);
    expect(result.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    return result.body;
  };
  const put = (text = "HELLO", mode = "free") => request("sign/put", { x: 0, y: 0, text, mode });
  const disk = () => targets().map(path => readFileSync(path));
  const paint = async () => {
    const start = (await request("paint/begin", {})).body;
    const current = start.blocks[0];
    expect((await request("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }],
      stamp: { width: 1, height: 1, cells: [{ ...current, metatileId: current.metatileId === 1 ? 2 : 1 }] }, origin: { x: 0, y: 0 } })).status).toBe(200);
    expect((await request("paint/end", {})).status).toBe(200);
  };

  it("commits the preview fingerprint and closes the session", async () => {
    const preparedSpy = vi.spyOn(saves, "prepareSave");
    const commitSpy = vi.spyOn(saves, "commitSave");
    expect((await put()).status).toBe(200);
    const before = disk(), plan = await preview();
    expect(plan.changes.length).toBeGreaterThan(0);
    const result = await request("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(200);
    expect(result.body.fingerprint).toBe(plan.fingerprint);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy.mock.calls[0]![2]).toBe(preparedSpy.mock.results.at(-1)!.value);
    expect(disk()).not.toEqual(before);
    expect(store.has(map)).toBe(false);
    expect((await preview()).changes).toEqual([]);
  });

  it("prepare failure returns a null preview fingerprint and a 500 commit without writing", async () => {
    expect((await put()).status).toBe(200);
    const before = disk();
    vi.spyOn(saves, "prepareSave").mockImplementation(() => { throw new Error("injected prepare failure"); });
    const plan = await request("plan");
    expect(plan.status).toBe(200);
    expect(plan.body.changes.length).toBeGreaterThan(0);
    expect(plan.body.refusals).toEqual([{ code: "SAVE_PREPARE_FAILED", subject: map,
      message: "Could not read the files this save would write: injected prepare failure",
      fix: "Close any program holding the file or fix its permissions, then reopen Save" }]);
    expect(plan.body.fingerprint).toBeNull();
    const result = await request("commit", { fingerprint: "previous-preview" });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "injected prepare failure" });
    expect(disk()).toEqual(before);
    expect(store.has(map)).toBe(true);
  });

  it("rejects a stale preview with a fresh usable fingerprint and preserves disk", async () => {
    expect((await put()).status).toBe(200);
    const old = await preview(), before = disk();
    await paint();
    const result = await request("commit", { fingerprint: old.fingerprint });
    expect(result.status).toBe(409);
    expect(result.body.notice).toEqual({ code: "PLAN_CHANGED", subject: map,
      message: "Changes were made since you opened Save", fix: "Review the updated changes and save again" });
    expect(result.body.refusals).toEqual([]);
    expect(result.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.body.fingerprint).not.toBe(old.fingerprint);
    expect(disk()).toEqual(before);
    expect(store.has(map)).toBe(true);
    expect((await request("commit", { fingerprint: result.body.fingerprint })).status).toBe(200);
    expect(disk()).not.toEqual(before);
  });

  it.each([undefined, "", " \r\n ", "{}", '{"fingerprint":null}', '{"fingerprint":42}', '{"fingerprint":{}}'])(
    "rejects a missing or non-string fingerprint (%j) without writing", async raw => {
      expect((await put()).status).toBe(200);
      const before = disk();
      const result = await rawCommit(raw);
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ changes: [], refusals: [{ code: "PLAN_FINGERPRINT_MISSING", subject: map,
        message: expect.stringContaining("no plan fingerprint"), fix: "Reopen Save and try again" }], signNotices: [] });
      expect(disk()).toEqual(before);
      expect(store.has(map)).toBe(true);
    });

  it.each(["{", "null", "[]", '"fingerprint"', "42"])("keeps malformed/non-object body errors (%j)", async raw => {
    expect((await put()).status).toBe(200);
    const before = disk(), result = await rawCommit(raw);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: expect.any(String) });
    expect(result.body.error).toContain(raw === "{" ? "invalid JSON body" : "expected a JSON object body");
    expect(disk()).toEqual(before);
  });

  it.each([false, true])("planning twice preserves fingerprint, session and undo depth (linked sign: %s)", async linked => {
    expect((await put("HELLO", linked ? "name" : "free")).status).toBe(200);
    if (linked) {
      expect((await request("commit", { fingerprint: (await preview()).fingerprint })).status).toBe(200);
      changeLinkedSource();
    }
    await paint();
    const entry = store.open(map);
    const history = () => Object.fromEntries(Object.entries(entry.stack).map(([key, value]) =>
      [key, Array.isArray(value) ? value.length : value]));
    const beforeSession = structuredClone(entry.session), beforeStack = history(), before = disk();
    expect(entry.stack.canUndo()).toBe(true);
    const first = await preview(), second = await preview();
    expect(first.changes.length).toBeGreaterThan(0);
    if (linked) expect(first.changes.some((change: { path: string }) => change.path.endsWith(scriptSuffix))).toBe(true);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(entry.stack.canUndo()).toBe(true);
    expect(history()).toEqual(beforeStack); // includes actual undo/redo depth
    expect(entry.session).toEqual(beforeSession);
    expect(disk()).toEqual(before);
  });

  it("rejects an outside map.json edit with 409 and preserves the outside bytes", async () => {
    expect((await put()).status).toBe(200);
    const plan = await preview();
    // Whitespace is valid JSON and changes only before bytes, not the staged output.
    writeFileSync(json(), Buffer.concat([readFileSync(json()), Buffer.from(" ")]));
    const before = disk(), result = await request("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(409);
    expect(result.body.notice.code).toBe("PLAN_CHANGED");
    expect(result.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.body.fingerprint).not.toBe(plan.fingerprint);
    expect(disk()).toEqual(before);
  });

  it("refuses an outside blockdata edit and preserves every target", async () => {
    await paint();
    const plan = await preview(), outside = Buffer.from(readFileSync(blocks()));
    outside[0] = outside[0]! ^ 1;
    writeFileSync(blocks(), outside);
    const before = disk(), result = await request("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(409);
    expect(result.body.notice.code).toBe("PLAN_CHANGED");
    expect(result.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(disk()).toEqual(before);
  });
  it("a commit that throws after writing still invalidates the symbol index", async () => {
    const build = vi.spyOn(symbolIndex, "buildGbaSymbolIndex");
    expect((await fetch(`${base}/api/defects/${map}`)).status).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
    expect((await put()).status).toBe(200);
    const plan = await preview();
    vi.spyOn(saves, "commitSave").mockImplementation(() => { throw new Error("injected commit failure"); });
    expect((await request("commit", { fingerprint: plan.fingerprint })).status).toBe(500);
    expect((await fetch(`${base}/api/defects/${map}`)).status).toBe(200);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
