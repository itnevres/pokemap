import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { sidecarRoutes, type SidecarRouteDeps } from "../src/sidecarRoutes.js";
import { MAX_BODY_BYTES, sendJson } from "../src/http.js";
import { projectPaths } from "@pokemap/core/src/config/paths.js";
import type { Conflict } from "@pokemap/core/src/world/connections.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";

// Plan H task H-b: sidecarRoutes must be mountable with NOTHING but a temp
// root and stub deps. This file deliberately imports no `createServer`,
// `createProjectHandler` or `createGbcProjectHandler` -- that is the point:
// the module owns no family and a test that needed a real project would not
// pin "no family dependency".

const CONFLICTS: Conflict[] = [
  { map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } },
  { map: "Route18", viaA: { from: "Route17", x: 30, y: 50 }, viaB: { from: "Route19", x: 10, y: 11 } },
];
const KEY_A = '["Route17","Route18",30,50,"Route16",30,49]';

// Deliberately unsorted: the route must sort the expanded list itself.
const KNOWN = new Set(["Route17", "Route18", "Route19", "Route20"]);
const EXPANDED = ["Route20", "Route17", "Route19"];

let root: string;
let server: Server;
let base: string;
let expandCalls: string[];
let worldCalls: number;

const deps = (): SidecarRouteDeps => ({
  root,
  getWorld: () => { worldCalls++; return { conflicts: CONFLICTS }; },
  knownMap: (name) => KNOWN.has(name),
  expandSeed: (seedMap) => { expandCalls.push(seedMap); return EXPANDED; },
  autoLayoutReply: (v) => ({ dungeonAutoLayout: v }),
});

const mount = (): void => {
  // Built once, like the real mounts: a closure-state regression is visible.
  const route = sidecarRoutes(deps());
  server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => sendJson(res, code, body);
    if (route(req, url, send)) return;
    sendJson(res, 404, { error: "not found" });
  });
};

const start = (): Promise<void> => new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const stop = (): Promise<void> => new Promise((resolvePromise) => server.close(() => resolvePromise()));

const get = (path: string) => fetch(`${base}${path}`);
const sendJsonBody = (method: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (path: string, body: unknown) => sendJsonBody("POST", path, body);
const postRaw = (path: string, body: string) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pokemap-sidecar-routes-"));
  expandCalls = [];
  worldCalls = 0;
  mount();
  await start();
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await stop();
  // Mirrors world.test.ts:42's scratch cleanup: refuse to delete anything
  // that is not inside a `pokemap-sidecar-routes-` temp dir.
  if (!resolve(root).startsWith(join(resolve(tmpdir()), "pokemap-sidecar-routes-"))) {
    throw new Error("scratch cleanup escaped temp root");
  }
  rmSync(root, { recursive: true, force: true });
});

const sidecarPath = () => projectPaths(root).sidecar;
const dungeonsPath = () => projectPaths(root).dungeons;

describe("sidecarRoutes (mounted bare, stub deps only)", () => {
  it("GET /api/dungeons answers [] with no sidecar written", async () => {
    const r = await get("/api/dungeons");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
    expect(existsSync(dungeonsPath())).toBe(false);
  });

  it("POST /api/dungeons creates, GET lists it, PATCH edits it, DELETE removes it", async () => {
    const created = await (await post("/api/dungeons", { name: "D", maps: ["Route17"] })).json() as { id: string; name: string; maps: string[] };
    expect(created).toMatchObject({ name: "D", maps: ["Route17"] });
    expect(typeof created.id).toBe("string");

    const listed = await (await get("/api/dungeons")).json() as { id: string }[];
    expect(listed.some((d) => d.id === created.id)).toBe(true);

    const patched = await (await sendJsonBody("PATCH", `/api/dungeons/${created.id}`, { name: "E", maps: ["Route19"] })).json() as { id: string; name: string; maps: string[] };
    expect(patched).toEqual({ id: created.id, name: "E", maps: ["Route19"] });

    // The 200 body alone does not prove the write: the list and the file must show it.
    const edited = { id: created.id, name: "E", maps: ["Route19"] };
    expect(await (await get("/api/dungeons")).json()).toEqual([edited]);
    expect((JSON.parse(readFileSync(dungeonsPath(), "utf8")) as { dungeons: unknown[] }).dungeons).toEqual([edited]);

    const deleted = await fetch(`${base}/api/dungeons/${created.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });
    expect((await (await get("/api/dungeons")).json() as unknown[])).toEqual([]);
  });

  it("POST /api/dungeons with a seedMap returns the expanded list SORTED", async () => {
    const r = await post("/api/dungeons", { name: "Seeded", seedMap: "Route17" });
    expect(r.status).toBe(200);
    const created = await r.json() as { maps: string[] };
    expect(created.maps).toEqual([...EXPANDED].sort());
    expect(expandCalls).toEqual(["Route17"]);
  });

  it("400s a create with an unknown seedMap", async () => {
    const r = await post("/api/dungeons", { name: "Bad", seedMap: "NoSuchMap" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "seedMap NoSuchMap is not a known map" });
    expect(expandCalls).toEqual([]);
    expect(existsSync(dungeonsPath())).toBe(false);
  });

  it("DELETE removes a dungeon, and a second DELETE 404s it", async () => {
    const created = await (await post("/api/dungeons", { name: "D", maps: ["Route17"] })).json() as { id: string };
    expect((await fetch(`${base}/api/dungeons/${created.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(`${base}/api/dungeons/${created.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await (await get("/api/dungeons")).json() as unknown[])).toEqual([]);
  });

  it("POST /api/dungeons rejects a null/array body with the raw text, without writing", async () => {
    const before = existsSync(dungeonsPath()) ? readFileSync(dungeonsPath()) : null;
    for (const body of ["null", "[]"]) {
      const r = await postRaw("/api/dungeons", body);
      expect(r.status, body).toBe(400);
      const reply = await r.json() as { error: string };
      expect(reply.error).toBe(`expected a dungeon object, got ${body}`);
    }
    expect(existsSync(dungeonsPath())).toBe(before !== null);
  });

  it("400s POST /api/dungeons with no name and with a bad name/maps shape", async () => {
    const noName = await post("/api/dungeons", { maps: [] });
    expect(noName.status).toBe(400);
    expect((await noName.json() as { error: string }).error).toEqual('expected a non-empty "name" string, got {"maps":[]}');

    // `{}` has no name: the handler's own name check, quoting the raw text.
    const empty = await postRaw("/api/dungeons", "{}");
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'expected a non-empty "name" string, got {}' });

    const badMaps = await post("/api/dungeons", { name: "x", maps: [1] });
    expect(badMaps.status).toBe(400);
    const badMapsBody = await badMaps.json() as { error: string };
    expect(badMapsBody.error).toBe('"maps" must be a string array when present, got {"name":"x","maps":[1]}');
  });

  it("404s an unknown id on PATCH and on DELETE", async () => {
    const patched = await sendJsonBody("PATCH", "/api/dungeons/nope", {});
    expect(patched.status).toBe(404);
    expect(await patched.json()).toEqual({ error: "no dungeon nope" });
    expect((await fetch(`${base}/api/dungeons/nope`, { method: "DELETE" })).status).toBe(404);
  });

  it("PATCH validates name and maps with exact texts, and a partial PATCH leaves the other key alone", async () => {
    const created = await (await post("/api/dungeons", { name: "D", maps: ["Route17"] })).json() as { id: string };
    const patchRaw = (body: string) => fetch(`${base}/api/dungeons/${created.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body });
    const before = readFileSync(dungeonsPath());

    const blank = await patchRaw('{"name":" "}');
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: '"name" must be a non-empty string when present, got {"name":" "}' });
    const badMaps = await patchRaw('{"maps":"x"}');
    expect(badMaps.status).toBe(400);
    expect(await badMaps.json()).toEqual({ error: '"maps" must be a string array when present, got {"maps":"x"}' });
    expect(readFileSync(dungeonsPath())).toEqual(before);

    expect(await (await patchRaw('{"name":"N2"}')).json()).toEqual({ id: created.id, name: "N2", maps: ["Route17"] });
    expect(await (await patchRaw('{"maps":["Route19"]}')).json()).toEqual({ id: created.id, name: "N2", maps: ["Route19"] });
  });

  it("400s a malformed percent-escape dungeon id on both PATCH and DELETE", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      const r = await fetch(`${base}/api/dungeons/%E0%A4%A`, { method, headers: { "content-type": "application/json" }, body: method === "PATCH" ? "{}" : undefined });
      expect(r.status, method).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed dungeon id %E0%A4%A" });
    }
  });

  it("POST /api/world/conflicts/accept persists acceptedConflicts and 404s an unknown key", async () => {
    const unknown = await post("/api/world/conflicts/accept", { key: "unknown", accepted: true });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown conflict key unknown" });
    expect(existsSync(sidecarPath())).toBe(false);

    const ok = await post("/api/world/conflicts/accept", { key: KEY_A, accepted: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ acceptedConflicts: [KEY_A] });
    expect(readSidecar(root).acceptedConflicts).toEqual([KEY_A]);

    // Un-accept removes it again.
    const undone = await post("/api/world/conflicts/accept", { key: KEY_A, accepted: false });
    expect(undone.status).toBe(200);
    expect(await undone.json()).toEqual({ acceptedConflicts: [] });
    expect(readSidecar(root).acceptedConflicts).toEqual([]);
  });

  it("400s the accept body shape with the raw-body text, without writing", async () => {
    const r = await postRaw("/api/world/conflicts/accept", '{"key":1}');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'expected { key: string, accepted: boolean }, got {"key":1}' });
    expect(existsSync(sidecarPath())).toBe(false);
  });

  it("builds the world lazily: only the accept route ever calls getWorld", async () => {
    expect(worldCalls).toBe(0); // not at mount
    await post("/api/world/placement", { map: "Route17", x: 1, y: 2 });
    await post("/api/dungeons", { name: "D", maps: ["Route17"] });
    await get("/api/dungeons");
    await post("/api/world/dungeons", { enabled: false });
    expect(worldCalls).toBe(0);
    await post("/api/world/conflicts/accept", { key: KEY_A, accepted: true });
    expect(worldCalls).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/world/placement writes manualPlacements for a known map only", async () => {
    const before = existsSync(sidecarPath()) ? readFileSync(sidecarPath()) : null;
    const bad = [
      // `null` / `[]`: the whole-body guard, quoting the raw text.
      ["null", "expected { map: string, x: number, y: number }, got null"],
      ["[]", "expected { map: string, x: number, y: number }, got []"],
      // The known-map check: unknown names and `__proto__` write nothing.
      ['{"map":"__proto__","x":1,"y":2}', "unknown map __proto__"],
      ['{"map":"NoSuchMap","x":1,"y":2}', "unknown map NoSuchMap"],
      // `1e999` parses to Infinity, which only Number.isFinite rejects.
      ['{"map":"Route17","x":1e999,"y":0}', "expected { map: string, x: number, y: number }, got {\"map\":\"Route17\",\"x\":1e999,\"y\":0}"],
      // A missing / non-number coordinate is the same shape 400.
      ['{"map":"Route17","x":0}', "expected { map: string, x: number, y: number }, got {\"map\":\"Route17\",\"x\":0}"],
      ['{"map":"Route17","x":"0","y":0}', "expected { map: string, x: number, y: number }, got {\"map\":\"Route17\",\"x\":\"0\",\"y\":0}"],
      // Same for y: Infinity and a string.
      ['{"map":"Route17","x":0,"y":1e999}', "expected { map: string, x: number, y: number }, got {\"map\":\"Route17\",\"x\":0,\"y\":1e999}"],
      ['{"map":"Route17","x":0,"y":"0"}', "expected { map: string, x: number, y: number }, got {\"map\":\"Route17\",\"x\":0,\"y\":\"0\"}"],
    ] as const;
    for (const [body, error] of bad) {
      const r = await postRaw("/api/world/placement", body);
      expect(r.status, body).toBe(400);
      const reply = await r.json() as { error: string };
      expect(reply.error, body).toBe(error);
    }
    // Nothing above wrote the sidecar: a 400 that still wrote would pass a
    // status-only check.
    expect(existsSync(sidecarPath())).toBe(before !== null);
    if (before) expect(readFileSync(sidecarPath())).toEqual(before);

    const ok = await post("/api/world/placement", { map: "Route17", x: 5, y: 6 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(readSidecar(root).manualPlacements.Route17).toEqual({ x: 5, y: 6 });
  });

  it("POST /api/world/dungeons returns autoLayoutReply's value and persists it", async () => {
    const r = await post("/api/world/dungeons", { enabled: false });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ dungeonAutoLayout: false });
    expect(readSidecar(root).dungeonAutoLayout).toBe(false);
  });

  it("400s a bad POST /api/world/dungeons body with the raw-body text, writing nothing", async () => {
    for (const body of ["null", "[]", "{}", '{"enabled":"yes"}']) {
      const r = await postRaw("/api/world/dungeons", body);
      expect(r.status, body).toBe(400);
      expect(await r.json(), body).toEqual({ error: `expected { enabled: boolean }, got ${body}` });
    }
    const notJson = await postRaw("/api/world/dungeons", "not json");
    expect(notJson.status).toBe(400);
    expect((await notJson.json() as { error: string }).error.startsWith("invalid JSON body:")).toBe(true);
    expect(existsSync(sidecarPath())).toBe(false);
  });

  it("answers 500 (not a hang) when world.json is corrupted, leaving the bytes untouched", async () => {
    const corrupted = "{not json";
    mkdirSync(dirname(sidecarPath()), { recursive: true });
    writeFileSync(sidecarPath(), corrupted);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await post("/api/world/placement", { map: "Route17", x: 1, y: 2 });
      expect(r.status).toBe(500);
      expect(((await r.json()) as { error: string }).error).toContain("is not valid JSON");
      expect(readFileSync(sidecarPath(), "utf8")).toBe(corrupted);
    } finally {
      spy.mockRestore();
    }
  }, 10_000);

  it("400s an invalid JSON body and 413s an oversize body, writing nothing", async () => {
    const invalid = await postRaw("/api/dungeons", "{");
    expect(invalid.status).toBe(400);
    const invalidBody = await invalid.json() as { error: string };
    expect(invalidBody.error).toContain("invalid JSON body:");
    expect(existsSync(dungeonsPath())).toBe(false);

    const big = await postRaw("/api/world/placement", "x".repeat(MAX_BODY_BYTES + 1));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: "request body too large" });
    expect(existsSync(sidecarPath())).toBe(false);
  });

  it("returns false and sends nothing for a path it does not own", async () => {
    const calls: unknown[] = [];
    const req = { method: "GET" } as IncomingMessage;
    const handled = sidecarRoutes(deps())(req, new URL("http://localhost/api/world"), (code, body) => calls.push([code, body]));
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
  });

  // Each route is gated on its method; a wrong method on an owned path must
  // fall through to the caller (404), not be read as a body route.
  it.each([
    ["GET", "/api/world/placement"],
    ["GET", "/api/world/conflicts/accept"],
    ["GET", "/api/world/dungeons"],
    ["PUT", "/api/dungeons"],
    ["GET", "/api/dungeons/abc"],
    ["POST", "/api/dungeons/abc"],
  ])("%s %s falls through to the caller (404, nothing written)", async (method, path) => {
    const r = await fetch(`${base}${path}`, { method });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
    expect(existsSync(sidecarPath())).toBe(false);
    expect(existsSync(dungeonsPath())).toBe(false);
  });

  it("returns false for a sibling path with the same prefix (/api/dungeonsx)", async () => {
    const r = await get("/api/dungeonsx");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });

  it("dungeon POST with explicit maps keeps the caller's order (only seed expansion is sorted)", async () => {
    const created = await (await post("/api/dungeons", { name: "Ordered", maps: ["Route19", "Route17"] })).json() as { maps: string[] };
    expect(created.maps).toEqual(["Route19", "Route17"]);
    expect(expandCalls).toEqual([]);
  });

  it("400s POST /api/dungeons with a non-string seedMap, without writing", async () => {
    const r = await post("/api/dungeons", { name: "Bad", seedMap: 2 });
    expect(r.status).toBe(400);
    const reply = await r.json() as { error: string };
    expect(reply.error).toBe('"seedMap" must be a string when present, got {"name":"Bad","seedMap":2}');
    expect(existsSync(dungeonsPath())).toBe(false);
  });

  it("PATCH /api/dungeons/<id> rejects a null/array body with the raw text, without writing", async () => {
    // Kept separate from the create case because PATCH must reach its body
    // reader at all -- its `decodeSegment` runs first, so this also pins that
    // a plain id ("x") is not mistaken for a malformed escape.
    const before = existsSync(dungeonsPath()) ? readFileSync(dungeonsPath()) : null;
    for (const body of ["null", "[]"]) {
      const r = await fetch(`${base}/api/dungeons/x`, { method: "PATCH", headers: { "content-type": "application/json" }, body });
      expect(r.status, body).toBe(400);
      const reply = await r.json() as { error: string };
      expect(reply.error).toBe(`expected a dungeon object, got ${body}`);
    }
    expect(existsSync(dungeonsPath())).toBe(before !== null);
  });


  // Review minor (Opus, H-b): every owned path answers only its own methods;
  // any other method must fall through (the harness 404) so a dropped
  // `req.method ===` guard cannot go unnoticed.
  it.each([
    ["GET", "/api/world/placement"],
    ["GET", "/api/world/conflicts/accept"],
    ["GET", "/api/world/dungeons"],
    ["PUT", "/api/dungeons"],
    ["GET", "/api/dungeons/x"],
    ["POST", "/api/dungeons/x"],
    ["PATCH", "/api/dungeons/"],
  ])("%s %s falls through to the caller's own 404", async (method, path) => {
    const r = await fetch(`${base}${path}`, { method });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
    expect(existsSync(sidecarPath())).toBe(false);
    expect(existsSync(dungeonsPath())).toBe(false);
  });

  // Review minor (Opus, H-b): the id is DECODED before it is compared; a UUID
  // never shows the difference, an id with a space does (the UIs encode).
  it("PATCH and DELETE match a dungeon by its decoded id", async () => {
    mkdirSync(dirname(dungeonsPath()), { recursive: true });
    writeFileSync(dungeonsPath(), JSON.stringify({ version: 1, dungeons: [{ id: "a b", name: "N", maps: [] }] }));
    const patched = await sendJsonBody("PATCH", "/api/dungeons/a%20b", { name: "M" });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({ id: "a b", name: "M", maps: [] });
    const deleted = await fetch(`${base}/api/dungeons/a%20b`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await (await get("/api/dungeons")).json()).toEqual([]);
  });
});
