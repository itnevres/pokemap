/**
 * Oversize-request helpers for the route-level 413 tests (Plan H task E, review round 1).
 * `fetch` cannot stream a chunked body, so these go through `node:http`. Each request
 * gets its own socket (`agent: false`) and is torn down once the response is in: the server
 * answers 413 while the client is still uploading, and the remaining bytes are not needed.
 */
import { request } from "node:http";
import type { IncomingMessage } from "node:http";
import { MAX_BODY_BYTES } from "../../src/http.js";

const MIB = 1024 * 1024;

export interface OversizeReply { status: number; body: string }

function upload(port: number, path: string, bytes: number, headers: Record<string, string>): Promise<OversizeReply> {
  return new Promise((resolve, reject) => {
    let replied = false;
    const req = request({ host: "127.0.0.1", port, path, method: "POST", headers, agent: false }, (res: IncomingMessage) => {
      replied = true;
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => { resolve({ status: res.statusCode ?? 0, body }); req.destroy(); });
      res.on("error", reject);
    });
    // Once the reply is in, the reset from tearing the upload down is expected.
    req.on("error", (error) => { if (!replied) reject(error); });
    void (async () => {
      const chunk = Buffer.alloc(MIB, 0x61);
      for (let left = bytes; left > 0 && !req.destroyed; left -= MIB) {
        const piece = left >= MIB ? chunk : chunk.subarray(0, left);
        if (!req.write(piece)) await new Promise<void>((done) => { req.once("drain", done); req.once("close", done); });
      }
      if (!req.destroyed) req.end();
    })();
  });
}

/** `MAX_BODY_BYTES + 1` (by default) streamed with `transfer-encoding: chunked`, so no length is declared. */
export const postChunked = (port: number, path: string, bytes = MAX_BODY_BYTES + 1): Promise<OversizeReply> =>
  upload(port, path, bytes, { "transfer-encoding": "chunked" });

/** The same body with a real `content-length`, sent byte for byte like a UI `fetch` would. */
export const postDeclared = (port: number, path: string, bytes = MAX_BODY_BYTES + 1): Promise<OversizeReply> =>
  upload(port, path, bytes, { "content-length": String(bytes) });
