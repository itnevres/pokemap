/**
 * `/api/edit/:map/*` for GBC (pokecrystal-family) projects -- the GBC
 * counterpart of the edit routes in `index.ts`, with the same paths and the
 * same begin/apply/end, undo/redo, discard, plan/commit and event-op lifecycle,
 * kept out of `gbcRoutes.ts` so that file stays a thin dispatch list.
 *
 * Every route resolves the `:map` segment first (malformed -> 400, unknown ->
 * 404), then its sub-route. Request bodies are an error boundary: every field
 * is checked for its type before anything touches a session, and a bad one is
 * a 400 naming the field. A core event op that refuses (a user-input problem,
 * not a bug) is a 400 with the core's message, and leaves the session as it was.
 */
import type { IncomingMessage } from "node:http";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import type { Block, GbcWarpEvent } from "@pokemap/core/src/gbc/model/types.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import {
  addGbcEvent, deleteGbcEvent, findGbcWarpsRetargetedByDelete, moveGbcEvent,
  type GbcEventEdit, type GbcEventKind,
} from "@pokemap/core/src/gbc/edit/events.js";
import { paintCells, floodFill, shiftGrid, type GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import { changedBlockIndices, planGbcSave } from "@pokemap/core/src/gbc/write/save.js";
import { formatDiffJson } from "@pokemap/core/src/write/diff.js";
import { createGbcEditSessionStore, gbcSnapshotOf, type GbcSessionEntry } from "./gbcEditSessions.js";
import { snapshotCommand } from "./editSessions.js";
import { decodeMapName } from "./gbcRoutes.js";
import { readBody } from "./index.js";

type Send = (code: number, body: unknown) => void;
type Obj = Record<string, unknown>;

/** Thrown by the validators below; `handle` turns it into a 400. */
class BadRequest extends Error {}
const bad = (message: string): never => { throw new BadRequest(message); };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const show = (v: unknown): string => JSON.stringify(v) ?? "undefined";

function int(o: Obj, key: string): number {
  const v = o[key];
  return isInt(v) ? v : bad(`"${key}" must be an integer, got ${show(v)}`);
}

function point(v: unknown, what: string): { x: number; y: number } {
  return isObj(v) && isInt(v.x) && isInt(v.y) ? { x: v.x, y: v.y } : bad(`"${what}" must be { x: integer, y: integer }, got ${show(v)}`);
}

/** Stricter than GBA's `validateStampAndOrigin`: positive integer size, exactly width*height cells, integer ids. Range is the save guard's job, not this one's. */
function stampOf(v: unknown): GbcStamp {
  const ok = isObj(v) && isInt(v.width) && v.width > 0 && isInt(v.height) && v.height > 0
    && Array.isArray(v.cells) && v.cells.length === v.width * v.height
    && v.cells.every((c) => isObj(c) && isInt(c.metatileId));
  return ok ? (v as unknown as GbcStamp) : bad(`"stamp" must be { width, height (positive integers), cells: width*height of { metatileId: integer } }, got ${show(v)}`);
}

const KINDS: readonly string[] = ["warp", "coord", "bg", "object"];
const kindOf = (o: Obj): GbcEventKind =>
  KINDS.includes(o.kind as string) ? (o.kind as GbcEventKind) : bad(`"kind" must be one of ${KINDS.join(", ")}, got ${show(o.kind)}`);

const NOTHING_OPEN = { blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false };

const sessionBody = (e: GbcSessionEntry) => ({
  blocks: e.session.blocks, events: e.session.events, isDirty: e.session.isDirty,
  canUndo: e.stack.canUndo(), canRedo: e.stack.canRedo(),
});

export function createGbcEditRoutes(proj: GbcProject, hooks: { onCommit(): void }) {
  const store = createGbcEditSessionStore(proj);
  const mapNames = new Set(proj.maps.map((m) => m.name));

  const mapConsts = new Set(proj.maps.map((m) => m.constName));

  /**
   * The prev-snapshot / core-op / push-undo-command sequence shared by event
   * move/add/delete. The core op runs on the session's CURRENT text before
   * anything is assigned, so a refusal (it throws) leaves the session exactly
   * as it was and surfaces as a 400 with the core's message. An op that
   * changes nothing (a move to the event's own position) pushes no undo step:
   * it would only make the session dirty with an empty plan.
   */
  function eventOp(entry: GbcSessionEntry, label: string, op: (text: string) => GbcEventEdit): void {
    const prev = gbcSnapshotOf(entry.session);
    let edit: GbcEventEdit;
    try { edit = op(prev.eventsText); }
    catch (e) { return bad(e instanceof Error ? e.message : String(e)); }
    if (edit.text === prev.eventsText) return;
    entry.stack.push(entry.session, snapshotCommand(label, prev, { ...prev, eventsText: edit.text, events: edit.events }));
  }

  /**
   * Every map's warps for the delete-renumber scan: the open session's if one
   * is open (so an unsaved warp edit on ANY map counts), else the file's. The
   * deleting map uses `preDelete`, its warps as they were before this delete.
   * ponytail: no cache -- a warp delete re-reads ~391 small map files each
   * time (measured in the Task 4 report). Upgrade: cache per map, invalidated
   * on commit (`hooks.onCommit`) and on any event op on that map.
   */
  function allWarps(deleting: string, preDelete: GbcWarpEvent[]): { name: string; warps: GbcWarpEvent[] }[] {
    return proj.maps.map((m) => ({
      name: m.name,
      warps: m.name === deleting ? preDelete
        : store.has(m.name) ? store.open(m.name).session.events.warps
        : loadGbcMapEvents(proj.root, m).events.warps,
    }));
  }

  /** Applies a paint tool's request body to the session's blocks. Validates everything before touching the session. */
  function paintApply(name: string, body: Obj): Block[] {
    const tool = body.tool;
    let paint: (blocks: Block[], w: number, h: number) => Block[];
    if (tool === "pencil") {
      if (!Array.isArray(body.targets)) bad(`"targets" must be an array of { x: integer, y: integer }, got ${show(body.targets)}`);
      const targets = (body.targets as unknown[]).map((t) => {
        if (!isObj(t) || !isInt(t.x) || !isInt(t.y)) bad(`"targets" must be an array of { x: integer, y: integer }, got ${show(body.targets)}`);
        return { x: (t as Obj).x as number, y: (t as Obj).y as number };
      });
      const stamp = stampOf(body.stamp);
      const origin = point(body.origin, "origin");
      paint = (b, w, h) => paintCells(b, w, h, targets, stamp, origin.x, origin.y);
    } else if (tool === "rect") {
      const [x0, y0, x1, y1] = [int(body, "x0"), int(body, "y0"), int(body, "x1"), int(body, "y1")];
      const stamp = stampOf(body.stamp);
      const origin = point(body.origin, "origin");
      paint = (b, w, h) => {
        // Expanded server-side like GBA, but clamped to the grid first:
        // paintCells skips out-of-bounds targets anyway, so a corner of 1e9
        // would only burn memory building targets it throws away.
        const targets: { x: number; y: number }[] = [];
        for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(h - 1, Math.max(y0, y1)); y++) {
          for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(w - 1, Math.max(x0, x1)); x++) targets.push({ x, y });
        }
        return paintCells(b, w, h, targets, stamp, origin.x, origin.y);
      };
    } else if (tool === "bucket") {
      const [x, y] = [int(body, "x"), int(body, "y")];
      if (!isObj(body.replacement) || !isInt(body.replacement.metatileId)) {
        bad(`"replacement" must be { metatileId: integer }, got ${show(body.replacement)}`);
      }
      const id = (body.replacement as Obj).metatileId as number;
      paint = (b, w, h) => floodFill(b, w, h, x, y, id);
    } else if (tool === "shift") {
      const [dx, dy] = [int(body, "dx"), int(body, "dy")];
      paint = (b, w, h) => shiftGrid(b, w, h, dx, dy);
    } else {
      return bad(`"tool" must be one of pencil, rect, bucket, shift, got ${show(tool)}`);
    }
    // ponytail: this reads then writes entry.session.blocks across the
    // `readBody` await in `handle`, same accepted gap as GBA's /paint/apply: a
    // same-map /undo or second /paint/apply could interleave. The intended
    // client awaits each round trip before the next, so no locking here;
    // upgrade path is a per-session promise queue if a client ever pipelines.
    const entry = store.open(name);
    const { width: w, height: h } = entry.session.layout;
    return (entry.session.blocks = paint(entry.session.blocks, w, h));
  }

  type Result = { code: number; body: unknown };
  const ok = (body: unknown): Result => ({ code: 200, body });
  const asSession = (entry: GbcSessionEntry) => ok(sessionBody(entry));

  /** Route table keyed `METHOD sub-route`. `body: true` routes get the parsed JSON object. */
  const routes: Record<string, { body: boolean; run(name: string, body: Obj): Result }> = {
    "POST paint/begin": { body: false, run: (name) => {
      const entry = store.open(name);
      // A redundant begin (no intervening end) must NOT overwrite the real
      // start-of-gesture snapshot with the already-mutated blocks: that would
      // drop everything painted before the re-begin from the undo step.
      entry.strokeStartBlocks ??= entry.session.blocks.map((b) => ({ ...b }));
      return asSession(entry);
    } },
    "POST paint/apply": { body: true, run: (name, body) => { paintApply(name, body); return asSession(store.open(name)); } },
    "POST paint/end": { body: false, run: (name) => {
      const entry = store.open(name);
      const start = entry.strokeStartBlocks;
      if (start) {
        const next = gbcSnapshotOf(entry.session);
        if (changedBlockIndices(start, entry.session.blocks).length > 0) {
          entry.stack.push(entry.session, snapshotCommand("paint", { ...next, blocks: start }, next));
        }
        entry.strokeStartBlocks = null;
      }
      return asSession(entry);
    } },
    "POST undo": { body: false, run: (name) => {
      if (!store.has(name)) return ok(NOTHING_OPEN); // nothing open -- a no-op, never opens a session
      const entry = store.open(name);
      entry.stack.undo(entry.session);
      return asSession(entry);
    } },
    "POST redo": { body: false, run: (name) => {
      if (!store.has(name)) return ok(NOTHING_OPEN);
      const entry = store.open(name);
      entry.stack.redo(entry.session);
      return asSession(entry);
    } },
    "POST discard": { body: false, run: (name) => { store.close(name); return ok(NOTHING_OPEN); } },
    "POST event/move": { body: true, run: (name, body) => {
      const [kind, index, x, y] = [kindOf(body), int(body, "index"), int(body, "x"), int(body, "y")];
      const entry = store.open(name);
      eventOp(entry, "move event", (text) => moveGbcEvent(text, name, kind, index, x, y));
      return asSession(entry);
    } },
    "POST event/add": { body: true, run: (name, body) => {
      const kind = kindOf(body);
      const args = body.args;
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) bad(`"args" must be an array of strings, got ${show(args)}`);
      const objectConst = body.objectConst;
      if (objectConst !== undefined && typeof objectConst !== "string") bad(`"objectConst" must be a string when present, got ${show(objectConst)}`);
      const entry = store.open(name);
      eventOp(entry, "add event", (text) => addGbcEvent(text, name, kind, args as string[], { mapConsts, objectConst: objectConst as string | undefined }));
      return asSession(entry);
    } },
    "POST event/delete": { body: true, run: (name, body) => {
      const [kind, index] = [kindOf(body), int(body, "index")];
      const entry = store.open(name);
      const preDelete = entry.session.events.warps;
      eventOp(entry, "delete event", (text) => deleteGbcEvent(text, name, kind, index));
      const warpRenumberWarnings = kind === "warp"
        ? findGbcWarpsRetargetedByDelete(allWarps(name, preDelete), { mapName: name, mapConst: entry.session.map.constName, index })
        : [];
      return ok({ ...sessionBody(entry), warpRenumberWarnings });
    } },
    "GET plan": { body: false, run: (name) => ok(formatDiffJson(planGbcSave(proj, store.open(name).session))) },
  };

  return {
    /** Returns true if it handled (or is asynchronously handling) the request. */
    handle(req: IncomingMessage, url: URL, send: Send): boolean {
      if (!url.pathname.startsWith("/api/edit/")) return false;
      const m = /^\/api\/edit\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (!m) { send(404, { error: "not found" }); return true; }
      const rawName = m[1]!;
      const name = decodeMapName(rawName);
      if (name === undefined) { send(400, { error: `malformed map name ${rawName}` }); return true; }
      if (!mapNames.has(name)) { send(404, { error: `no map ${name}` }); return true; }
      const route = routes[`${req.method} ${m[2]}`];
      if (!route) { send(404, { error: "not found" }); return true; }

      const run = async (): Promise<Result> => {
        let body: Obj = {};
        if (route.body) {
          const text = await readBody(req);
          let parsed: unknown;
          try { parsed = JSON.parse(text); }
          catch (e) { return { code: 400, body: { error: `invalid JSON body: ${(e as Error).message}` } }; }
          if (!isObj(parsed)) return { code: 400, body: { error: `expected a JSON object body, got ${text}` } };
          body = parsed;
        }
        return route.run(name, body);
      };
      run().then(
        (r) => send(r.code, r.body),
        (e: unknown) => {
          if (e instanceof BadRequest) return send(400, { error: e.message });
          console.error(e);
          send(500, { error: e instanceof Error ? e.message : String(e) });
        },
      );
      return true;
    },
    /** Current blocks of an open session for `name`, else undefined (the render route's override). */
    openBlocks: (name: string): Block[] | undefined => (store.has(name) ? store.open(name).session.blocks : undefined),
    dirtyMaps: (): string[] => store.dirty(),
    closeAll: (): void => store.closeAll(),
  };
}
