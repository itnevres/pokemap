import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_BODY_BYTES = 16 * 1024 * 1024;

export class BodyTooLarge extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLarge";
  }
}

/**
 * Buffers a request body to a string. Moved here from index.ts in Plan H
 * task E1. In index.ts, `/api/world/placement` was the first POST route this
 * server ever needed -- every route before it only ever read -- and it was
 * exported (Plan 6c A1) so `hub.ts`'s own `POST /api/hub/open` reuses this
 * instead of a second copy. Reads UTF-8, rejecting before buffering more
 * than `max` bytes; the caller answers 413.
 */
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
 * route calls this instead of `decodeURIComponent` directly, and
 * answers 400 naming the raw (still-encoded) segment on `undefined`.
 */
export function decodeSegment(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Plan H task H-a: the JSON-body preamble every POST route wrote out by hand
 * (read, parse, 400 on bad JSON, shape check, 413 on an oversize body, 500
 * on a throw). Messages match the hand-written copies exactly. An empty body
 * is invalid JSON (400); the one route that treats it as `{}` keeps its own
 * code. No content-type check: the routes never made one. `handler` also
 * receives the raw text, for routes whose later 400s quote it.
 */
export function jsonBody<T>(
  req: IncomingMessage,
  send: (status: number, body: unknown) => unknown,
  guard: (parsed: unknown) => parsed is T,
  shapeText: string,
  handler: (body: T, text: string) => unknown,
): Promise<void> {
  return readBody(req)
    .then((text) => {
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch (e) { send(400, { error: `invalid JSON body: ${(e as Error).message}` }); return; }
      if (!guard(parsed)) { send(400, { error: `expected ${shapeText}, got ${text}` }); return; }
      return handler(parsed, text);
    })
    .then(() => undefined)
    .catch((e: unknown) => {
      if (e instanceof BodyTooLarge) { send(413, { error: "request body too large" }); return; }
      console.error(e);
      send(500, { error: e instanceof Error ? e.message : String(e) });
    });
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

/**
 * Replies 413 before any route runs when the declared `content-length`
 * exceeds the cap. The connection is kept: closing it while the client is
 * still uploading would reset it and hide the 413 from the client. Node
 * discards the unread body, so memory stays bounded.
 */
export function refuseOversize(req: IncomingMessage, res: ServerResponse): boolean {
  if (!declaresOversizeBody(req)) return false;
  sendJson(res, 413, { error: "request body too large" });
  return true;
}

/** True when the request carries a body: a positive `content-length`, or chunked
 *  framing (which has no length). A bodyless POST (discard, undo) has neither. */
function declaresBody(req: IncomingMessage): boolean {
  return Number(req.headers["content-length"]) > 0 || req.headers["transfer-encoding"] !== undefined;
}

/**
 * Plan H task J: a POST, PUT or PATCH that carries a body must label it
 * `application/json` (parameters such as `; charset=utf-8` are fine). A cross-site
 * page can send `text/plain` with no preflight, so the Origin/Host check was the
 * only defence; this closes the second one. Replies 415 and returns true. A
 * bodyless write passes. Like `refuseOversize`, the connection is kept and Node
 * discards the unread body.
 */
export function refuseNonJsonBody(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") return false;
  if (!declaresBody(req)) return false;
  const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (type === "application/json") return false;
  sendJson(res, 415, { error: "request body must be application/json" });
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

