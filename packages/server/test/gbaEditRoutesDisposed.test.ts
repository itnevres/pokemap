// Plan H I2b review finding (M3): the moved POST /api/edit/<name>/event/create route re-checks
// `ctx.disposed` AFTER `readBody` resolves. The accessor on the context is what makes that re-check
// live; a plain `disposed: false` snapshot, or a destructured copy, would still pass every other test
// (hub.test.ts only hits the synchronous 503 guard at the top of `handle`).
import { describe, expect, it } from "vitest";
import { request, createServer as createHttp } from "node:http";
import { createProjectHandler } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA edit routes: disposed while a request body is in flight", () => {
  it("answers 503 project closed when dispose() lands between the headers and the end of the body", async () => {
    const handler = createProjectHandler(SUBJECT_ROOT);
    const http = createHttp((req, res) => handler.handle(req, res));
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    const addr = http.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const outcome = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({
          host: "127.0.0.1", port, method: "POST", path: "/api/edit/EcruteakCity/event/create",
          headers: { "content-type": "application/json", "content-length": "2" },
        }, (res) => {
          let body = "";
          res.on("data", (c) => { body += c; });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on("error", reject);
        req.write("{");
        // Let the route pass its path checks and start awaiting the body, then close the handler.
        setTimeout(() => { handler.dispose(); req.end("}"); }, 300);
      });
      expect(outcome.status).toBe(503);
      expect(JSON.parse(outcome.body)).toEqual({ error: "project closed" });
    } finally {
      await new Promise<void>((r) => http.close(() => r()));
    }
  }, 60_000);
});
