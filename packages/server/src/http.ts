import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_BODY_BYTES = 16 * 1024 * 1024;

export class BodyTooLarge extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLarge";
  }
}

/**
 * Buffers a request body to a string. `/api/world/placement` is the first
 * POST route this server has ever needed -- every route before it only ever
 * reads. Exported (Plan 6c A1) so `hub.ts`'s own `POST /api/hub/open` reuses
 * this instead of a second copy.
 */
/** Reads UTF-8, rejecting before buffering more than `max` bytes. The caller answers 413. */
export function readBody(req: IncomingMessage, max = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > max) {
        chunks.length = 0;
        cleanup();
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (error: Error) => {
      chunks.length = 0;
      cleanup();
      reject(error);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/**
 * `decodeURIComponent` throws a `URIError` on a malformed percent-escape
 * (e.g. a lone `%` or a truncated multi-byte UTF-8 sequence like
 * `%E0%A4%A`) -- letting that throw reach a route's own try/catch-free body
 * would surface as a 500 naming only "URI malformed", not the offending
 * segment (Task 1b fix round 1, spec review finding 7). Every `:name`-style
 * route below calls this instead of `decodeURIComponent` directly, and
 * answers 400 naming the raw (still-encoded) segment on `undefined` --
 * `index.ts`'s GBA routes keep their own pre-existing 500-on-malformed-
 * escape behaviour unchanged, since this fix is GBC-only (spec ground rule:
 * "index.ts is not touched in this task").
 */
export function decodeSegment(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}


/** JSON replies always declare their type and disable content sniffing. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

/** Missing, malformed and negative lengths do not declare an oversized body. */
export function declaresOversizeBody(req: IncomingMessage): boolean {
  return Number(req.headers["content-length"]) > MAX_BODY_BYTES;
}

/** Refuse before reading; close only once the response has been sent. */
export function refuseOversize(req: IncomingMessage, res: ServerResponse): boolean {
  if (!declaresOversizeBody(req)) return false;
  res.setHeader("connection", "close");
  res.once("finish", () => req.destroy());
  sendJson(res, 413, { error: "request body too large" });
  return true;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `new URL(...).hostname`, parsed from a header value that may or may not
 * already carry a scheme (`Origin` always does; `Host` never does) --
 * returns `undefined` on anything unparseable rather than throwing, so
 * every call site can treat "malformed" the same as "not local."
 */
function hostnameOf(headerValue: string, alreadyHasScheme: boolean): string | undefined {
  try {
    return new URL(alreadyHasScheme ? headerValue : `http://${headerValue}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * SR-F9 (security): reject any request whose `Origin` or `Host` header
 * names a non-local hostname, before it is routed anywhere -- for EVERY
 * path, not just `POST /api/hub/open`. Two distinct browser-reachable
 * attacks this blocks, both already possible against this dev server before
 * the hub existed but widened by it (spec review F9): (1) a same-origin-
 * policy-exempt drive-by request from any web page a person happens to have
 * open -- `POST /api/hub/open` with `{ force: true }` would discard unsaved
 * edits or open an arbitrary directory with no user interaction, and
 * `GET /api/hub/browse` would let a remote page enumerate the local
 * filesystem; (2) DNS rebinding, where an attacker's domain later resolves
 * to `127.0.0.1` -- at that point the attacker's own page can be considered
 * "same-origin" by the browser, so `Origin` alone isn't enough; checking
 * `Host` too (what the request line itself claims to be addressed to) is
 * what actually stops it, since the hub only ever means to answer for
 * itself. The Vite dev proxy forwards a same-site `Origin` and a
 * `Host: localhost:<port>` (any port -- this is a dev server on a port that
 * can change), so it passes; Node's own `fetch` sends `Host: 127.0.0.1:
 * <port>` and no `Origin` at all, so every existing test passes too.
 */
export function isCrossOriginRequest(headers: { origin?: string; host?: string }): boolean {
  if (headers.origin) {
    const originHost = hostnameOf(headers.origin, true);
    if (!originHost || !LOCAL_HOSTNAMES.has(originHost)) return true;
  }
  const hostHost = headers.host ? hostnameOf(headers.host, false) : undefined;
  if (!hostHost || !LOCAL_HOSTNAMES.has(hostHost)) return true;
  return false;
}

