import { Agent, createServer, request, type IncomingMessage, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BodyTooLarge, MAX_BODY_BYTES, declaresOversizeBody, decodeSegment, isCrossOriginRequest, jsonBody, readBody, refuseNonJsonBody, refuseOversize, sendJson } from "../src/http.js";

let server: Server | undefined;
async function listen(handler: RequestListener): Promise<number> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

function post(port: number, chunks: string[], headers: Record<string, string> = {}, agent?: Agent) {
  return new Promise<{ status: number; headers: IncomingMessage["headers"]; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", headers, agent }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      res.on("error", reject);
    });
    // A server that never answers (e.g. `refuseOversize` removed, so the declared body is awaited) fails in 2 s, not at the suite timeout.
    req.setTimeout(2000, () => req.destroy(new Error("no response within 2 s")));
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

describe("shared HTTP boundary (no corpus)", () => {
  it("decodes valid segments and returns undefined for malformed escapes", () => {
    expect(decodeSegment("New%42arkTown")).toBe("NewBarkTown");
    expect(decodeSegment("%E0%A4%A")).toBeUndefined();
  });

  it("sendJson sets the status, JSON and nosniff headers, and serialized body", async () => {
    const port = await listen((_req, res) => sendJson(res, 201, { ok: true }));
    const response = await post(port, []);
    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe('{"ok":true}');
  });

  it("readBody returns a small UTF-8 request body", async () => {
    const port = await listen((req, res) => {
      void readBody(req).then((body) => sendJson(res, 200, { body }));
    });
    const response = await post(port, ["hello ", "世界"]);
    expect(JSON.parse(response.body)).toEqual({ body: "hello 世界" });
  });

  it.each([
    { chunks: ["1234", "5678"], bytes: 8, status: 200 },
    { chunks: ["1234", "56789"], bytes: 9, status: 413 },
    { chunks: ["€€€"], bytes: 9, status: 413 },
  ])("readBody applies an 8-byte cap to a $bytes-byte chunked body ($status)", async ({ chunks, status }) => {
    let caught: unknown;
    let transferEncoding: string | undefined;
    let contentLength: string | undefined;
    const port = await listen((req, res) => {
      transferEncoding = req.headers["transfer-encoding"];
      contentLength = req.headers["content-length"];
      void readBody(req, 8).then(
        (body) => sendJson(res, 200, { body }),
        (error: unknown) => { caught = error; sendJson(res, 413, { error: "request body too large" }); },
      );
    });
    const response = await post(port, chunks, { "transfer-encoding": "chunked" });
    expect(transferEncoding).toBe("chunked");
    expect(contentLength).toBeUndefined();
    expect(response.status).toBe(status);
    if (status === 413) {
      expect(caught).toBeInstanceOf(BodyTooLarge);
      expect((caught as Error).name).toBe("BodyTooLarge");
      expect(JSON.parse(response.body)).toEqual({ error: "request body too large" });
    } else {
      expect(caught).toBeUndefined();
      expect(JSON.parse(response.body)).toEqual({ body: chunks.join("") });
    }
  });

  it("readBody removes only its own listeners after exceeding the cap", async () => {
    const stream = new PassThrough();
    const external = () => {};
    for (const event of ["data", "end", "error"]) stream.on(event, external);
    const result = readBody(stream as unknown as IncomingMessage, 8);
    const rejected = expect(result).rejects.toBeInstanceOf(BodyTooLarge);
    stream.write(Buffer.from("1234"));
    stream.write(Buffer.from("56789"));
    await rejected;
    for (const event of ["data", "end", "error"]) expect(stream.listeners(event)).toEqual([external]);
    stream.end();
  });

  it.each([
    [String(MAX_BODY_BYTES + 1), true],
    [String(MAX_BODY_BYTES), false],
    [undefined, false],
    ["abc", false],
    ["-5", false],
  ])("declaresOversizeBody checks content-length %s", (length, expected) => {
    const req = { headers: { "content-length": length } } as IncomingMessage;
    expect(declaresOversizeBody(req)).toBe(expected);
  });

  it("refuseOversize answers 413 JSON without reading a declared oversized body", async () => {
    let read = false;
    let refused = false;
    const port = await listen((req, res) => {
      refused = refuseOversize(req, res);
      if (refused) return;
      read = true;
      sendJson(res, 200, {});
    });
    const response = await post(port, [], { "content-length": String(MAX_BODY_BYTES + 1) });
    expect(response.status).toBe(413);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(response.body)).toEqual({ error: "request body too large" });
    expect(refused).toBe(true);
    expect(read).toBe(false);
  });

  it("refuseOversize keeps the connection: a real oversize upload gets its 413, and the same keep-alive socket then serves a small request", async () => {
    const sockets: unknown[] = [];
    const port = await listen((req, res) => {
      sockets.push(req.socket);
      if (refuseOversize(req, res)) return;
      void readBody(req).then((body) => sendJson(res, 200, { body }));
    });
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const upload = (body: Buffer) => new Promise<{ status: number; connection: string | undefined; body: string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", agent, headers: { "content-length": String(body.length) } }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { text += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, connection: res.headers.connection, body: text }));
        res.on("error", reject);
      });
      req.setTimeout(10_000, () => req.destroy(new Error("no response within 10 s")));
      req.on("error", reject);
      req.end(body);
    });
    try {
      const first = await upload(Buffer.alloc(MAX_BODY_BYTES + 1, 0x61));
      expect(first.status).toBe(413);
      expect(first.connection).not.toBe("close");
      expect(JSON.parse(first.body)).toEqual({ error: "request body too large" });
      const second = await upload(Buffer.from("ok"));
      expect(second.status).toBe(200);
      expect(JSON.parse(second.body)).toEqual({ body: "ok" });
      expect(sockets).toHaveLength(2);
      expect(sockets[1]).toBe(sockets[0]);
    } finally {
      agent.destroy();
    }
  }, 60_000);

  it("refuseOversize leaves a small request available to its caller", async () => {
    const port = await listen((req, res) => {
      if (refuseOversize(req, res)) return;
      void readBody(req).then((body) => sendJson(res, 200, { body }));
    });
    expect(JSON.parse((await post(port, ["ok"], { "content-length": "2" })).body)).toEqual({ body: "ok" });
  });

  it.each([
    [{ origin: "http://evil.example", host: "127.0.0.1:5174" }, true],
    [{ host: "evil.example" }, true],
    [{ origin: "http://localhost:5173", host: "localhost:5174" }, false],
    [{ host: "127.0.0.1:5174" }, false],
    [{ origin: "http://[::1]:5173", host: "[::1]:5174" }, false],
    [{ origin: "null", host: "localhost:5174" }, true],
    [{ origin: "%", host: "localhost:5174" }, true],
    [{ host: "[" }, true],
    [{}, true],
  ])("isCrossOriginRequest preserves the local-only guard for %j", (headers, expected) => {
    expect(isCrossOriginRequest(headers)).toBe(expected);
  });

  describe("jsonBody", () => {
    const isShape = (v: unknown): v is { n: number } => typeof v === "object" && v !== null && typeof (v as { n?: unknown }).n === "number";
    const mount = (onBody: (b: { n: number }) => unknown = (b) => ({ got: b.n })) =>
      listen((req, res) => {
        void jsonBody(req, (status, body) => sendJson(res, status, body), isShape, "{ n: number }", (b) => { sendJson(res, 200, onBody(b)); });
      });

    it("passes a valid body to the handler", async () => {
      const port = await mount();
      const r = await post(port, ['{"n":', "7}"]);
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body)).toEqual({ got: 7 });
    });

    it("answers 400 with the parse message on malformed JSON, without calling the handler", async () => {
      let called = false;
      const port = await mount(() => { called = true; return {}; });
      const r = await post(port, ["{nope"]);
      expect(r.status).toBe(400);
      expect(JSON.parse(r.body).error).toMatch(/^invalid JSON body: /);
      expect(called).toBe(false);
    });

    it("answers 400 naming the expected shape and echoing the body, without calling the handler", async () => {
      let called = false;
      const port = await mount(() => { called = true; return {}; });
      const r = await post(port, ['{"n":"x"}']);
      expect(r.status).toBe(400);
      expect(JSON.parse(r.body)).toEqual({ error: 'expected { n: number }, got {"n":"x"}' });
      expect(called).toBe(false);
    });

    it("treats an empty body as invalid JSON (400)", async () => {
      const port = await mount();
      const r = await post(port, []);
      expect(r.status).toBe(400);
      expect(JSON.parse(r.body).error).toMatch(/^invalid JSON body: /);
    });

    it("ignores the content-type header", async () => {
      const port = await mount();
      const r = await post(port, ['{"n":1}'], { "content-type": "text/plain" });
      expect(r.status).toBe(200);
    });

    it("answers 413 when the streamed body exceeds the cap, without calling the handler", async () => {
      let called = false;
      const port = await mount(() => { called = true; return {}; });
      const r = await post(port, ["x".repeat(MAX_BODY_BYTES + 1)], { "transfer-encoding": "chunked" });
      expect(r.status).toBe(413);
      expect(JSON.parse(r.body)).toEqual({ error: "request body too large" });
      expect(called).toBe(false);
    }, 60_000);

    it("answers 500 with the message when the handler throws (synchronously, or by rejecting)", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const port = await listen((req, res) => {
          void jsonBody(req, (s, b) => sendJson(res, s, b), isShape, "{ n: number }", (b) => {
            if (b.n === 1) throw new Error("boom"); // synchronous throw
            return Promise.reject("str"); // rejection with a non-Error
          });
        });
        const a = await post(port, ['{"n":1}']);
        expect(a.status).toBe(500);
        expect(JSON.parse(a.body)).toEqual({ error: "boom" });
        const b = await post(port, ['{"n":2}']);
        expect(b.status).toBe(500);
        expect(JSON.parse(b.body)).toEqual({ error: "str" });
      } finally { spy.mockRestore(); }
    });
  });

  describe("refuseNonJsonBody (Plan H J3)", () => {
    // Answers 415 when refused, else 200 "passed"; the handler never reads the body.
    async function probe(method: string, chunks: string[], headers: Record<string, string> = {}) {
      const port = await listen((req, res) => {
        if (refuseNonJsonBody(req, res)) return;
        sendJson(res, 200, "passed");
      });
      const agent = new Agent({ keepAlive: false });
      const r = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, method, headers, agent }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c: string) => { body += c; });
          res.on("end", () => resolve({ status: res.statusCode!, body }));
        });
        req.setTimeout(2000, () => req.destroy(new Error("no response within 2 s")));
        req.on("error", reject);
        for (const c of chunks) req.write(c);
        req.end();
      });
      agent.destroy();
      return r;
    }
    const withLength = (body: string, type?: string) => ({ "content-length": String(Buffer.byteLength(body)), ...(type ? { "content-type": type } : {}) });

    it("answers 415 to a POST, PUT or PATCH body labelled text/plain or not labelled", async () => {
      for (const method of ["POST", "PUT", "PATCH"]) {
        const plain = await probe(method, ["{}"], withLength("{}", "text/plain"));
        expect(plain.status, method).toBe(415);
        expect(JSON.parse(plain.body)).toEqual({ error: "request body must be application/json" });
        expect((await probe(method, ["{}"], withLength("{}"))).status, `${method} unlabelled`).toBe(415);
      }
      expect((await probe("POST", ["{}"], withLength("{}", "application/x-www-form-urlencoded"))).status).toBe(415);
      expect((await probe("POST", ["{}"], withLength("{}", "application/jsonp"))).status).toBe(415);
    });

    it("answers 415 to a chunked body with no JSON label", async () => {
      expect((await probe("POST", ["{", "}"], { "content-type": "text/plain" })).status).toBe(415);
      expect((await probe("POST", ["{", "}"])).status).toBe(415);
    });

    it("lets application/json through, with parameters and in any case", async () => {
      for (const type of ["application/json", "application/json; charset=utf-8", "Application/JSON", " application/json ;charset=UTF-8"]) {
        expect((await probe("POST", ["{}"], withLength("{}", type))).status, type).toBe(200);
      }
      expect((await probe("POST", ["{", "}"], { "content-type": "application/json" })).status).toBe(200);
    });

    it("lets a bodyless write through whatever its label, and any GET or bodyless DELETE", async () => {
      expect((await probe("POST", [], { "content-length": "0" })).status).toBe(200);
      expect((await probe("POST", [], { "content-type": "text/plain", "content-length": "0" })).status).toBe(200);
      expect((await probe("POST", [])).status).toBe(200);
      expect((await probe("GET", [], { "content-type": "text/plain" })).status).toBe(200);
      expect((await probe("DELETE", [], { "content-type": "text/plain" })).status).toBe(200);
    });
  });
});
