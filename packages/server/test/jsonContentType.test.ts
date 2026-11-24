import { request as httpRequest } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";

// Plan H J3: the standalone `createServer` of both families answers 415 to a body that is not
// application/json and refuses a cross-origin request the way the hub does. Each family's own
// handler carries the 415 check, so each gets its own server here.
function raw(port: number, path: string, opts: { method: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const headers = { ...(opts.headers ?? {}), ...(opts.body !== undefined ? { "content-length": String(Buffer.byteLength(opts.body)) } : {}) };
    const req = httpRequest({ host: "127.0.0.1", port, path, method: opts.method, headers, agent: false }, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("no response within 5 s")));
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function suite(label: string, root: string, available: boolean) {
  describe.skipIf(!available)(`${label} createServer: JSON content type and cross-origin guard (J3)`, () => {
    let s: PokemapServer;
    let map = "";
    beforeAll(async () => {
      s = await createServer({ projectPath: root, port: 0 });
      map = "NewBarkTown";
    });
    afterAll(async () => { await s?.close(); });
    const path = () => `/api/edit/${map}/paint/apply`;

    it("answers 415 to a text/plain or unlabelled body", async () => {
      const body = JSON.stringify({ tool: "pencil" });
      expect((await raw(s.port, path(), { method: "POST", headers: { "content-type": "text/plain" }, body })).status).toBe(415);
      expect((await raw(s.port, path(), { method: "POST", body })).status).toBe(415);
      expect((await fetch(`http://127.0.0.1:${s.port}${path()}`, { method: "POST", body })).status).toBe(415); // Node's fetch labels a string body text/plain
    });

    it("lets a JSON body reach the route (a bad shape is a 400, not a 415) and a bodyless discard answer 200", async () => {
      const r = await raw(s.port, path(), { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: "{}" });
      expect(r.status).toBe(400);
      const discard = await fetch(`http://127.0.0.1:${s.port}/api/edit/${map}/discard`, { method: "POST" });
      expect(discard.status).toBe(200);
    });

    it("refuses a forged Origin or Host with 403, on a GET and on a POST", async () => {
      const headers = { Origin: "http://evil.example", Host: `127.0.0.1:${s.port}` };
      const get = await raw(s.port, "/api/project", { method: "GET", headers });
      expect(get.status).toBe(403);
      expect(JSON.parse(get.body)).toEqual({ error: "cross-origin request refused" });
      const post = await raw(s.port, path(), { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" });
      expect(post.status).toBe(403);
      expect((await raw(s.port, "/api/project", { method: "GET", headers: { Host: "evil.example" } })).status).toBe(403);
    });
  });
}

suite("GBA", SUBJECT_ROOT, hasProject(SUBJECT_ROOT));
suite("GBC", GBC_SUBJECT_ROOT, hasGbcProject(GBC_SUBJECT_ROOT));
