import * as saves from "@pokemap/core/src/gbc/write/save.js";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT } from "@pokemap/core/test/gbc/helpers/corpus.js";
import * as sessions from "../src/gbcEditSessions.js";

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC preview-bound saves (temporary subject copy)", () => {
  let root: string, server: Server, base: string;
  let store: ReturnType<typeof sessions.createGbcEditSessionStore>;
  const factory = sessions.createGbcEditSessionStore;
  const map = "Route29", scriptSuffix = "Route29.asm";
  const scripts = () => `${root}/maps/${map}.asm`;
  const targets = () => [scripts(), `${root}/${openGbcProject(root).map(map).blkPath}`];
  const changeLinkedSource = () => {
    const path = `${root}/data/maps/landmarks.asm`;
    const before = readFileSync(path, "utf8"), after = before.replace('db "ROUTE 29@"', 'db "NEW ROUTE@"');
    expect(after).not.toBe(before);
    writeFileSync(path, after);
  };
  beforeEach(async () => {
    root = copyGbcSubjectToTemp().replace(/\\/g, "/");
    vi.spyOn(sessions, "createGbcEditSessionStore").mockImplementation(proj => { store = factory(proj); return store; });
    server = createServer(createGbcProjectHandler(root).handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    vi.restoreAllMocks();
    if (root) removeTemp(root);
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
    const preparedSpy = vi.spyOn(saves, "prepareGbcSave");
    const commitSpy = vi.spyOn(saves, "commitGbcSave");
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
    vi.spyOn(saves, "prepareGbcSave").mockImplementation(() => { throw new Error("injected prepare failure"); });
    const plan = await request("plan");
    expect(plan.status).toBe(200);
    expect(plan.body.changes.length).toBeGreaterThan(0);
    expect(plan.body.refusals).toEqual([]);
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

  it("outside asm drift takes refusal precedence over the stale fingerprint and survives", async () => {
    expect((await put()).status).toBe(200);
    const plan = await preview();
    writeFileSync(scripts(), Buffer.concat([readFileSync(scripts()), Buffer.from("\n; outside edit\n")]));
    const before = disk(), result = await request("commit", { fingerprint: plan.fingerprint });
    expect(result.status).toBe(400);
    expect(result.body.refusals.length).toBeGreaterThan(0);
    expect(result.body.fingerprint).toBeNull();
    expect(result.body.notice).toBeUndefined();
    expect(disk()).toEqual(before);
    // Missing fingerprint still wins before planning, even when the session has refusals.
    const missing = await rawCommit();
    expect(missing.status).toBe(400);
    expect(missing.body.refusals[0].code).toBe("PLAN_FINGERPRINT_MISSING");
    expect(disk()).toEqual(before);
  });
});
