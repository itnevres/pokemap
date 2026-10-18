import { findGbcIndicator, insertGbcIndicator, updateGbcIndicator } from "@pokemap/core/src/indicator/gbc.js";
import { loadGbcOwnSprites, gbcIndicatorSprite, rankGbcIndicatorSpecies, suggestGbcIndicatorPlacement } from "@pokemap/core/src/indicator/gbcData.js";
import { gbcSpeciesNames } from "@pokemap/core/src/signs/linked.js";
import { findGbcSign, insertGbcSign, nextGbcSignNumber, updateGbcSign } from "@pokemap/core/src/gbc/signs.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { signHash, type SignMode } from "@pokemap/core/src/signs/marker.js";
import { gbcSignLabels, gbcSignParagraphs, refreshGbcLinkedSigns } from "./signRefresh.js";
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
 *
 * Error bodies: validation / refusal-by-core / 500 are `{ error }`; a commit
 * refused by the save guards is 400 with the diff JSON (`{ changes, refusals }`),
 * the same split as GBA's commit route.
 *
 * Concurrency (accepted, no locking): a request's body is parsed before its
 * handler runs, and the handler then runs synchronously, so there is no lost
 * update inside one request. But two in-flight requests on the same map apply
 * in ARRIVAL order, not send order, so a client that pipelines begin/apply/undo
 * can see them reordered. The intended client awaits each round trip. Upgrade
 * path: a per-map promise queue. Likewise a request still in flight when the
 * handler is disposed may reopen a session in the dead handler; nothing ever
 * serves it.
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
import { changedBlockIndices, commitGbcSave, planGbcSave } from "@pokemap/core/src/gbc/write/save.js";
import { formatDiffJson } from "@pokemap/core/src/write/diff.js";
import { createGbcEditSessionStore, gbcSnapshotOf, type GbcSessionEntry } from "./gbcEditSessions.js";
import { snapshotCommand } from "./editSessions.js";
import { decodeMapName } from "./gbcRoutes.js";
import { readBody } from "./index.js";

type Send = (code: number, body: unknown) => void;
type Obj = Record<string, unknown>;
type Result = { code: number; body: unknown };
const ok = (body: unknown): Result => ({ code: 200, body });

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

function points(v: unknown, what: string): { x: number; y: number }[] {
  return Array.isArray(v) ? v.map((p) => point(p, what)) : bad(`"${what}" must be an array of { x: integer, y: integer }, got ${show(v)}`);
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
   *
   * Core ops throw a plain `Error` for a refusal and there is no error class to
   * tell it apart from a genuine bug in them (a TypeError from a malformed
   * parse), so a core bug would also read as a 400 here. Accepted; a typed
   * refusal error in core would split them.
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
  function paintApply(name: string, body: Obj): void {
    const tool = body.tool;
    let paint: (blocks: Block[], w: number, h: number) => Block[];
    if (tool === "pencil") {
      const targets = points(body.targets, "targets");
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
    const entry = store.open(name);
    const { width: w, height: h } = entry.session.layout;
    entry.session.blocks = paint(entry.session.blocks, w, h);
  }

  const asSession = (entry: GbcSessionEntry) => ok(sessionBody(entry));

  const signFailure = (name: string, error: unknown): Result => ({ code: 400, body: { refusals: [{
    code: error instanceof Error && error.message === "hand-edited" ? "hand-edited" : "sign",
    fix: "Check the named source or sign text; refresh or unlink hand-edited signs explicitly.",
    subject: `${proj.root}/maps/${name}.asm`, message: error instanceof Error ? error.message : String(error),
  }] } });

  const indicatorCharmapPath = `${proj.root}/constants/charmap.asm`;
  const indicatorCharmapFix = "Restore a valid subject charmap and correct unsupported Indicator text before retrying.";
  const indicatorFailure = (name: string, error: unknown, line?: number,
    fix = "Check the named source, restore the generated Indicator shape, or correct the species and text before retrying."): Result => {
    const message = error instanceof Error ? error.message : String(error);
    const charmap = message.startsWith(`${indicatorCharmapPath}:`);
    const subject = charmap ? indicatorCharmapPath : `${proj.root}/maps/${name}.asm`;
    return { code: 400, body: { refusals: [{ code: "indicator", subject,
      message: line === undefined ? message : `${subject}:${line}: ${message}`, fix: charmap ? indicatorCharmapFix : fix,
    }] } };
  };
  function indicatorParagraphs(entry: GbcSessionEntry, text: string): string[][] {
    try { return gbcSignParagraphs(proj, entry, "free", text); }
    catch (error) { throw new Error(`${indicatorCharmapPath}: ${error instanceof Error ? error.message : String(error)}. ${indicatorCharmapFix}`); }
  }

  /** Plan-shaped refusal (same wire shape as GBA): 200 for a plan, 400 for a commit. */
  const planFailure = (name: string, error: unknown, code: number): Result =>
    ({ code, body: { changes: [], ...(signFailure(name, error).body as object), signNotices: [] } });

  const isSignEvent = (kind: string) => /^BGEVENT_(READ|UP|DOWN|LEFT|RIGHT)$/.test(kind);
  function stageSign(entry: GbcSessionEntry, label: string, text: string): Result {
    const prev = gbcSnapshotOf(entry.session);
    const events = parseMapEvents(text, entry.session.mapName);
    if (text !== prev.eventsText) entry.stack.push(entry.session, snapshotCommand(label, prev, { ...prev, eventsText: text, events }));
    return asSession(entry);
  }
  function signPlan(name: string) {
    const refreshed = refreshGbcLinkedSigns(proj, store.open(name));
    const plan = planGbcSave(proj, refreshed.session);
    return { plan, body: { ...formatDiffJson(plan), signNotices: refreshed.notices } };
  }

  /** Route table keyed `METHOD sub-route`. `body: true` routes get the parsed JSON object. */
  const routes: Record<string, { body: boolean; run(name: string, body: Obj): Result }> = {
    "GET indicator/at": { body: false, run: (name, body) => {
      try {
        const index = int(body, "index");
        if (index < 0) throw new Error('"index" must be non-negative');
        const entry = store.open(name), event = entry.session.events.objects[index];
        return ok({ indicator: event ? findGbcIndicator(entry.session.eventsText, event, loadGbcOwnSprites(proj.root)) : null });
      } catch (error) { return indicatorFailure(name, error); }
    } },
    "POST indicator/add": { body: true, run: (name, body) => {
      try {
        const x = int(body, "x"), y = int(body, "y");
        if (typeof body.species !== "string" || typeof body.text !== "string") throw new Error('"species" and "text" must be strings');
        const entry = store.open(name);
        if (x < 0 || y < 0 || x >= entry.session.map.width * 2 || y >= entry.session.map.height * 2) throw new Error("Indicator coordinates outside map");
        const species = body.species.toUpperCase().replace(/^SPECIES_/, "");
        if (!gbcSpeciesNames(proj.root).has(species)) throw new Error(`${proj.root}/data/pokemon/names.asm: unknown species ${species}`);
        const own = loadGbcOwnSprites(proj.root);
        const paragraphs = indicatorParagraphs(entry, body.text);
        const added = insertGbcIndicator(entry.session.eventsText, name, { x, y, species, sprite: gbcIndicatorSprite(species, own), paragraphs });
        const result = stageSign(entry, "place Indicator", added.text);
        return ok({ ...(result.body as object), scriptLabel: added.scriptLabel });
      } catch (error) { return indicatorFailure(name, error); }
    } },
    "POST indicator/update": { body: true, run: (name, body) => {
      try {
        const index = int(body, "index");
        if (index < 0 || typeof body.scriptLabel !== "string" || typeof body.species !== "string" || typeof body.text !== "string") throw new Error("expected index, scriptLabel, species and text");
        const entry = store.open(name), event = entry.session.events.objects[index];
        if (!event || event.script !== body.scriptLabel) return indicatorFailure(name,
          new Error("object script no longer matches this Indicator"), event === undefined ? undefined : event.lineIndex + 1,
          "Reload the map and select the current Indicator before retrying.");
        const own = loadGbcOwnSprites(proj.root);
        const block = findGbcIndicator(entry.session.eventsText, event, own);
        if (!block?.editable) return indicatorFailure(name, new Error(block?.reason ?? "object is not an editable Indicator"),
          event.lineIndex + 1, "Restore the generated Indicator shape or select an editable Indicator before retrying.");
        const species = body.species.toUpperCase().replace(/^SPECIES_/, "");
        if (!gbcSpeciesNames(proj.root).has(species)) throw new Error(`${proj.root}/data/pokemon/names.asm: unknown species ${species}`);
        const paragraphs = indicatorParagraphs(entry, body.text);
        return stageSign(entry, "update Indicator", updateGbcIndicator(entry.session.eventsText, name, index, block, species, gbcIndicatorSprite(species, own), paragraphs));
      } catch (error) { return indicatorFailure(name, error); }
    } },
    "GET sign/at": { body: false, run: (name, body) => {
      const [x, y] = [int(body, "x"), int(body, "y")];
      const entry = store.open(name);
      const event = entry.session.events.bgs.find((e) => e.x === x && e.y === y);
      if (!event) return ok({ kind: "empty" });
      if (!isSignEvent(event.bgEventType)) return ok({ kind: "other", eventKind: event.bgEventType });
      const block = findGbcSign(entry.session.eventsText, event.script);
      const baseline = block.marker?.hash ?? entry.signBaselines.get(event.script);
      return ok({ kind: "sign", scriptLabel: event.script, editable: block.editable, reason: block.reason,
        mode: block.marker?.mode ?? null, text: block.paragraphs.map((p) => p.join("\n")).join("\n\n"),
        handEdited: baseline !== undefined && (!block.editable || signHash(block.body) !== baseline) });
    } },
    "POST sign/put": { body: true, run: (name, body) => {
      const [x, y] = [int(body, "x"), int(body, "y")];
      if (!["free", "name", "species"].includes(body.mode as string)) bad('"mode" must be free, name, or species');
      if (typeof body.text !== "string") bad('"text" must be a string');
      if (body.scriptLabel !== undefined && typeof body.scriptLabel !== "string") bad('"scriptLabel" must be a string');
      if (body.force !== undefined && typeof body.force !== "boolean") bad('"force" must be a boolean');
      const entry = store.open(name);
      try {
        if (x < 0 || y < 0 || x >= entry.session.layout.width * 2 || y >= entry.session.layout.height * 2) throw new Error("sign coordinates outside map");
        const mode = body.mode as SignMode;
        const paragraphs = gbcSignParagraphs(proj, entry, mode, body.text as string);
        const event = entry.session.events.bgs.find((e) => e.x === x && e.y === y);
        let text: string;
        if (body.scriptLabel !== undefined) {
          if (!event || !isSignEvent(event.bgEventType) || event.script !== body.scriptLabel) throw new Error("sign label does not match tile");
          const block = findGbcSign(entry.session.eventsText, event.script);
          if (!block.editable) throw new Error(block.reason ?? "unsupported sign");
          text = updateGbcSign(entry.session.eventsText, block, mode, paragraphs,
            { force: body.force === true, baselineHash: entry.signBaselines.get(event.script) });
        } else {
          if (event) throw new Error(`tile already has ${event.bgEventType} event`);
          const reserved = gbcSignLabels(entry.session.eventsText)
            .filter((label) => new RegExp(`^${name}PokemapSign[0-9]+(?:Text)?$`).test(label))
            .map((label) => `${label.replace(/Text$/, "")}:`).join("\n");
          const n = nextGbcSignNumber(`${entry.session.eventsText}\n${reserved}`, name);
          text = insertGbcSign(entry.session.eventsText, name, n, mode, paragraphs);
          text = addGbcEvent(text, name, "bg", [String(x), String(y), "BGEVENT_READ", `${name}PokemapSign${n}`]).text;
        }
        return stageSign(entry, body.scriptLabel === undefined ? "place sign" : "update sign", text);
      } catch (error) { return signFailure(name, error); }
    } },
    "POST sign/resolve": { body: true, run: (name, body) => {
      if (typeof body.scriptLabel !== "string") bad('"scriptLabel" must be a string');
      if (body.action !== "refresh" && body.action !== "unlink") bad('"action" must be refresh or unlink');
      const entry = store.open(name);
      try {
        const block = findGbcSign(entry.session.eventsText, body.scriptLabel as string);
        if (!block.editable || !block.marker) throw new Error(block.reason ?? "sign has no marker");
        const mode = body.action === "unlink" ? "free" : block.marker.mode;
        const paragraphs = body.action === "unlink" ? block.paragraphs : gbcSignParagraphs(proj, entry, mode, block.paragraphs.map((p) => p.join("\n")).join("\n\n"));
        return stageSign(entry, `${body.action} sign`, updateGbcSign(entry.session.eventsText, block, mode, paragraphs, { force: true }));
      } catch (error) { return signFailure(name, error); }
    } },
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
    "POST commit": { body: false, run: (name) => {
      let prepared: ReturnType<typeof signPlan>;
      try { prepared = signPlan(name); } catch (error) { return planFailure(name, error, 400); }
      const { plan, body } = prepared;
      if (plan.refusals.length > 0) return { code: 400, body };
      // A throw (propagates to `handle`: console.error + 500 { error }) can come
      // after the .blk was already written, so the caches are cleared either way.
      try { commitGbcSave(proj, plan); } finally { hooks.onCommit(); }
      // Closed, not kept: the session's originals predate the write, and the
      // next open() re-reads the files. On a throw it stays open for a retry/discard.
      store.close(name);
      return ok(body);
    } },
    "GET plan": { body: false, run: (name) => {
      try { return ok(signPlan(name).body); } catch (error) { return planFailure(name, error, 200); }
    } },
  };

  return {
    /** Returns true when it claimed the request (the response is sent now or later); false means fall through. */
    handle(req: IncomingMessage, url: URL, send: Send): boolean {
      const suggestion = /^\/api\/indicator\/([^/]+)\/suggestions$/.exec(url.pathname);
      if (suggestion && req.method === "GET") {
        const name = decodeMapName(suggestion[1]!);
        if (name === undefined || !mapNames.has(name)) { send(404, { error: "no such map" }); return true; }
        try { send(200, { species: rankGbcIndicatorSpecies(proj, name), placement: suggestGbcIndicatorPlacement(proj, name) }); }
        catch (error) { const result = indicatorFailure(name, error); send(result.code, result.body); }
        return true;
      }
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
        if (req.method === "GET" && (m[2] === "sign/at" || m[2] === "indicator/at")) {
          for (const key of m[2] === "indicator/at" ? ["index"] : ["x", "y"]) {
            const value = url.searchParams.get(key);
            if (value === null || !/^-?\d+$/.test(value)) return { code: 400, body: { error: `"${key}" must be an integer` } };
            body[key] = Number(value);
          }
        }
        return route.run(name, body);
      };
      run().then((r) => send(r.code, r.body)).catch((e: unknown) => {
        if (e instanceof BadRequest) return send(400, { error: e.message });
        console.error(e);
        send(500, { error: e instanceof Error ? e.message : String(e) });
      });
      return true;
    },
    /** Current blocks of an open session for `name`, else undefined (the render route's override). */
    openBlocks: (name: string): Block[] | undefined => (store.has(name) ? store.open(name).session.blocks : undefined),
    dirtyMaps: (): string[] => store.dirty(),
    closeAll: (): void => store.closeAll(),
  };
}
