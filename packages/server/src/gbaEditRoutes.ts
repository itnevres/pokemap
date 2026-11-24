import { BodyTooLarge, decodeSegment, readBody } from "./http.js";
import { requireTilesetOwnership, refuseUnsavedBlockRefs, savedMetatileCount } from "./blockEditOwnership.js";
import { checkTilesetBaselines } from "@pokemap/core/src/blockEdit/save.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { BlockEditRefusal } from "@pokemap/core/src/blockEdit/types.js";
import { eventFailure } from "./addEventRoutes.js";
import { gbaSpeciesNames } from "@pokemap/core/src/signs/linked.js";
import { findGbaSign, gbaSignScript, gbaSignText, nextGbaSignNumber, updateGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { formatMarker, signHash, type SignMode } from "@pokemap/core/src/signs/marker.js";
import { effectiveGbaScripts, gbaSignLabels, gbaSignParagraphs, replaceGbaScripts } from "./signRefresh.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { snapshotOf, snapshotCommand } from "./editSessions.js";
import { brokenPathBody, refuseBrokenLayout } from "./brokenComponents.js";
import { paintCells, floodFill, shiftGrid, type Stamp } from "@pokemap/core/src/edit/paint.js";
import { applyScriptAppend, commitSave } from "@pokemap/core/src/write/save.js";
import { moveEvent, addEvent, deleteEvent, setObjectGraphics, findWarpsTargetingByIndex, eventSlot, appendIndex, dropPendingInsert, dropOwnedScripts, type EventKind } from "@pokemap/core/src/edit/events.js";
import { rankIndicatorSpecies, suggestIndicatorPlacement } from "@pokemap/core/src/signs/suggest.js";
import { buildGbaIndicator, guardGbaIndicatorWrite, findGbaIndicator, updateGbaIndicator, gbaIndicatorGraphics } from "@pokemap/core/src/indicator/gba.js";
import type { GbaEditRouteContext } from "./gbaRouteContext.js";

type Send = (code: number, body: unknown) => unknown;

/**
 * Shared by `/paint/apply`'s pencil and rect branches -- both need a
 * `stamp` shaped `{ width, height, cells: [] }` and an `{ x, y }` origin;
 * only how the TARGET cells are produced (a client-built array vs. two
 * corners expanded server-side) differs between them. Code-review fix:
 * this validation used to be duplicated near-verbatim in both branches.
 * Returns an error string for `send(400, { error })`, or undefined when
 * both are valid.
 */
function validateStampAndOrigin(stamp: unknown, origin: unknown): string | undefined {
  const s = stamp as { width?: unknown; height?: unknown; cells?: unknown } | undefined;
  if (!s || typeof s.width !== "number" || typeof s.height !== "number" || !Array.isArray(s.cells)) {
    return `"stamp" must be { width: number, height: number, cells: [] }, got ${JSON.stringify(stamp)}`;
  }
  const o = origin as { x?: unknown; y?: unknown } | undefined;
  if (typeof o?.x !== "number" || typeof o?.y !== "number") {
    return `"origin" must be { x: number, y: number }, got ${JSON.stringify(origin)}`;
  }
  return undefined;
}

/**
 * Plan H I2b: the GBA edit-session routes (paint, session, undo/redo/discard, plan, commit, event
 * create/move/add/delete, Indicator suggest/at, sign at/edit, Indicator add/update), moved verbatim out of
 * `createProjectHandler`'s `handle` if-chain in index.ts. Answers a request and returns true, or returns
 * false for a path it does not own so the caller keeps walking its own chain.
 */
export function gbaEditRoutes(ctx: GbaEditRouteContext): (req: IncomingMessage, res: ServerResponse, url: URL, send: Send) => boolean {
  const { project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, pngCache, signFailure, indicatorFailure, indicatorParagraphs, signPlan, sendSession, handleEventOp, getAllMapsForWarpScan, EVENT_KINDS } = ctx;
  return (req, res, url, send) => {
    // The moved text answers with `return send(...)` / `return readBody(...)` / `return sendSession(...)`, and falls
    // off the end for a path it does not own. `fellThrough` turns that into the boolean the loop needs
    // without touching a single moved line (the exceptions: bare `disposed` reads became `ctx.disposed` and the
    // `allMapsCache = undefined` write became `ctx.allMapsCache = undefined`, because both are `let`s in
    // `createProjectHandler` that a destructured copy would leave stale).
    let fellThrough = false;
    (() => {
      const createEventMatch = /^\/api\/edit\/([^/]+)\/event\/create$/.exec(url.pathname);
      if (createEventMatch && req.method === "POST") {
        const name = decodeSegment(createEventMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return void readBody(req).then(text => {
          if (ctx.disposed) return send(503, { error: "project closed" });
          try { const body = addEvents.create(name, JSON.parse(text)); send(200, { ...body, ...overlayStamp() }); }
          catch (error) { send(400, eventFailure("gba", name, error)); }
        }).catch(error => {
          if (error instanceof BodyTooLarge) return send(413, { error: "request body too large" });
          const broken = brokenPathBody(error); if (broken) return send(409, broken);
          send(400, eventFailure("gba", name, error));
        });
      }

      // Task 8 (Plan 2): paint-stroke lifecycle. begin/apply/end are three
      // separate requests on purpose -- see editSessions.ts's own doc
      // comment on why a whole stroke is one undo step even though it is
      // many HTTP requests.
      const paintBeginMatch = /^\/api\/edit\/(.+)\/paint\/begin$/.exec(url.pathname);
      if (paintBeginMatch && req.method === "POST") {
        const name = decodeSegment(paintBeginMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        // A redundant begin() while a stroke is already in progress (no
        // intervening end()) must NOT overwrite the real start-of-gesture
        // snapshot with the CURRENT (already-mutated) blocks -- doing so
        // would silently drop everything painted before the re-begin from
        // the eventual undo step and desync isDirty, the mirror image of
        // the double-/paint/end bug guarded by editSessions.ts's own
        // strokeStartBlocks reset.
        if (entry.strokeStartBlocks === null) {
          entry.strokeStartBlocks = entry.session.blocks.map((b) => ({ ...b }));
        }
        return sendSession(send, 200, entry);
      }

      const paintApplyMatch = /^\/api\/edit\/(.+)\/paint\/apply$/.exec(url.pathname);
      if (paintApplyMatch && req.method === "POST") {
        const name = decodeSegment(paintApplyMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: {
              tool?: unknown;
              targets?: { x: number; y: number }[]; stamp?: Stamp; origin?: { x: number; y: number };
              x0?: number; y0?: number; x1?: number; y1?: number;
              x?: number; y?: number; replacement?: { metatileId: number; collision?: number; elevation?: number };
              dx?: number; dy?: number;
            };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }

            // This request reads-then-writes entry.session.blocks across an
            // await (readBody's own round trip already happened above) --
            // in principle a same-map /undo or another /paint/apply could
            // interleave here. Low-likelihood in practice: the intended
            // client always awaits each round trip before sending the next
            // (the whole begin/apply/end design assumes exactly that), so
            // this is a known, accepted gap, not a guarantee against it.
            const entry = editEntryFor(name);
            const w = entry.session.layout.width, h = entry.session.layout.height;
            const guardIds = (ids: number[]) => {
              const layout = entry.session.layout;
              const split = project.splitFor(layout).metatiles;
              for (const [symbol, localIds] of [
                [layout.primaryTileset, ids.filter(id => id < split)],
                [layout.secondaryTileset, ids.filter(id => id >= split).map(id => id - split)],
              ] as const) {
                if (localIds.length === 0) continue;
                const path = canonicalTilesetPath(project.tilesetPaths(symbol).metatilesBin);
                const savedCount = savedMetatileCount(project.paths.root, path);
                refuseUnsavedBlockRefs(editSessions.entries(), name, path, savedCount, localIds);
              }
            };

            if (parsed.tool === "pencil") {
              const { targets, stamp, origin } = parsed;
              if (!Array.isArray(targets) || targets.some((t) => typeof t?.x !== "number" || typeof t?.y !== "number")) {
                return send(400, { error: `"targets" must be an array of { x: number, y: number }, got ${JSON.stringify(targets)}` });
              }
              const stampErr = validateStampAndOrigin(stamp, origin);
              if (stampErr) return send(400, { error: stampErr });
              guardIds(stamp!.cells.flatMap(cell => cell.metatileId === undefined ? [] : [cell.metatileId]));
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp!, origin!.x, origin!.y);
            } else if (parsed.tool === "rect") {
              // Task 11: takes the two corners and expands server-side,
              // rather than a client-built `targets` array like pencil --
              // cheaper over the wire for a large rect (one object instead
              // of width*height of them).
              const { x0, y0, x1, y1, stamp, origin } = parsed;
              if (typeof x0 !== "number" || typeof y0 !== "number" || typeof x1 !== "number" || typeof y1 !== "number") {
                return send(400, { error: `"x0", "y0", "x1" and "y1" must be numbers, got x0=${JSON.stringify(x0)} y0=${JSON.stringify(y0)} x1=${JSON.stringify(x1)} y1=${JSON.stringify(y1)}` });
              }
              const stampErr = validateStampAndOrigin(stamp, origin);
              if (stampErr) return send(400, { error: stampErr });
              const targets: { x: number; y: number }[] = [];
              for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) targets.push({ x, y });
              }
              guardIds(stamp!.cells.flatMap(cell => cell.metatileId === undefined ? [] : [cell.metatileId]));
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp!, origin!.x, origin!.y);
            } else if (parsed.tool === "bucket") {
              const { x, y, replacement } = parsed;
              if (typeof x !== "number" || typeof y !== "number") {
                return send(400, { error: `"x" and "y" must be numbers, got x=${JSON.stringify(x)} y=${JSON.stringify(y)}` });
              }
              if (typeof replacement?.metatileId !== "number") {
                return send(400, { error: `"replacement" must be { metatileId: number, ... }, got ${JSON.stringify(replacement)}` });
              }
              guardIds([replacement.metatileId]);
              entry.session.blocks = floodFill(entry.session.blocks, w, h, x, y, replacement);
            } else if (parsed.tool === "shift") {
              const { dx, dy } = parsed;
              if (typeof dx !== "number" || typeof dy !== "number") {
                return send(400, { error: `"dx" and "dy" must be numbers, got dx=${JSON.stringify(dx)} dy=${JSON.stringify(dy)}` });
              }
              entry.session.blocks = shiftGrid(entry.session.blocks, w, h, dx, dy);
            } else {
              return send(400, { error: `unknown tool ${JSON.stringify(parsed.tool)}` });
            }
            return sendSession(send, 200, entry);
          })
          .catch((e: unknown) => {
            if (e instanceof BodyTooLarge) return send(413, { error: "request body too large" });
            const broken = brokenPathBody(e); if (broken) return send(409, broken);
            if (e instanceof BlockEditRefusal) return send(409, { error: `${name}: ${e.message}`, code: e.code });
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const paintEndMatch = /^\/api\/edit\/(.+)\/paint\/end$/.exec(url.pathname);
      if (paintEndMatch && req.method === "POST") {
        const name = decodeSegment(paintEndMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        if (entry.strokeStartBlocks) {
          const prev = { ...snapshotOf(entry.session), blocks: entry.strokeStartBlocks };
          const next = snapshotOf(entry.session);
          if (JSON.stringify(prev.blocks) !== JSON.stringify(next.blocks)) {
            entry.stack.push(entry.session, snapshotCommand("paint", prev, next));
          }
          entry.strokeStartBlocks = null;
        }
        return sendSession(send, 200, entry);
      }

      const sessionMatch = /^\/api\/edit\/(.+)\/session$/.exec(url.pathname);
      if (sessionMatch && req.method === "GET") {
        const name = decodeSegment(sessionMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        if (!editSessions.has(name)) return send(200, { ...overlayStamp(), blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false });
        return sendSession(send, 200, editEntryFor(name));
      }

      const undoMatch = /^\/api\/edit\/(.+)\/undo$/.exec(url.pathname);
      if (undoMatch && req.method === "POST") {
        const name = decodeSegment(undoMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!editSessions.has(name)) return send(200, { ...overlayStamp(), blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false }); // nothing open -- a no-op, not a 500
        const entry = editEntryFor(name);
        entry.stack.undo(entry.session);
        return sendSession(send, 200, entry);
      }

      const redoMatch = /^\/api\/edit\/(.+)\/redo$/.exec(url.pathname);
      if (redoMatch && req.method === "POST") {
        const name = decodeSegment(redoMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!editSessions.has(name)) return send(200, { ...overlayStamp(), blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false });
        const entry = editEntryFor(name);
        try { entry.stack.redo(entry.session, candidate => {
          addEvents.checkHeaderOwnership(name, candidate);
          const edits = (candidate.tilesetEdits ?? []).map(edit => ({ path: edit.path, before: Buffer.from(edit.before), after: Buffer.from(edit.after) }));
          requireTilesetOwnership(editSessions.entries(), name, edits.map(edit => edit.path));
          checkTilesetBaselines(project.paths.root, edits);
        }); }
        catch (error) {
          if (error instanceof BlockEditRefusal) return send(409, { error: `${name}: ${error.message}`, code: error.code });
          return send(400, eventFailure("gba", name, error));
        }
        return sendSession(send, 200, entry);
      }

      // Plan 2 follow-up 5: explicit "give up on this whole session, revert
      // to disk state" -- the session store's own close() (sessionStore.ts) already does exactly
      // this (it forgets the map's entry); this route is just the first thing
      // that ever calls it outside a successful commit. Deliberately its own
      // route, not a repurposing of SaveDialog's Cancel button (see that
      // component's own comment) -- Cancel stays a non-destructive
      // dialog-close, this is the real discard action.
      const discardMatch = /^\/api\/edit\/(.+)\/discard$/.exec(url.pathname);
      if (discardMatch && req.method === "POST") {
        const name = decodeSegment(discardMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        editSessions.close(name);
        addEvents.invalidate();
        // Same "nothing open" shape the undo/redo routes already return when
        // editSessions.has(name) is false -- after a discard, that's exactly
        // true. Idempotent: discarding an already-clean or never-opened
        // session is a harmless no-op with the same response, matching
        // the "always safe to drop" note in sessionStore.ts's header.
        return send(200, { ...overlayStamp(), blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false });
      }

      // Task 9: save/commit. planSave/commitSave both live in core (I8's
      // one writer); this route's own job is just wiring an open session to
      // them and turning a refusal into a 400 rather than a 200 that lies
      // about having saved.
      const planMatch = /^\/api\/edit\/(.+)\/plan$/.exec(url.pathname);
      if (planMatch && req.method === "GET") {
        const name = decodeSegment(planMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        try { return send(200, signPlan(name).body); }
        catch (error) { return send(200, { changes: [], ...signFailure(name, error), signNotices: [], fingerprint: null }); }
      }

      const commitMatch = /^\/api\/edit\/(.+)\/commit$/.exec(url.pathname);
      if (commitMatch && req.method === "POST") {
        const name = decodeSegment(commitMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req).then(raw => {
          let parsed: unknown;
          try { parsed = raw.trim() === "" ? {} : JSON.parse(raw); }
          catch (error) { return send(400, { error: `invalid JSON body: ${(error as Error).message}` }); }
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return send(400, { error: `expected a JSON object body, got ${raw}` });
          }
          const fingerprint = (parsed as { fingerprint?: unknown }).fingerprint;
          if (typeof fingerprint !== "string") return send(400, {
            changes: [], refusals: [{ code: "PLAN_FINGERPRINT_MISSING", subject: name,
              message: "The Save request carried no plan fingerprint", fix: "Reopen Save and try again" }], signNotices: [],
          });
          let fresh: ReturnType<typeof signPlan>;
          try { fresh = signPlan(name); }
          catch (error) { return send(400, { changes: [], ...signFailure(name, error), signNotices: [] }); }
          const { plan, prepared, prepareError, body } = fresh;
          if (plan.refusals.length > 0) return send(400, body);
          if (prepareError !== undefined) return send(500, { error: prepareError instanceof Error ? prepareError.message : String(prepareError) });
          if (body.fingerprint !== fingerprint) return send(409, { ...body, notice: {
            code: "PLAN_CHANGED", subject: name, message: "Changes were made since you opened Save",
            fix: "Review the updated changes and save again",
          } });
          try {
            try {
              commitSave(project, plan, prepared, undefined, { checkNames: fresh.checkNames });
              // Only successful writes close the session; sync in finally sees the new union.
              editSessions.close(name);
            } finally {
              // A failed commit may still have written (or failed to restore) a file.
              syncOverlay();
              symbols.invalidate(); addEvents.invalidate();
              // Plan H Task G: a commit writes this map's map.json, so everything parsed from it is stale.
              // Cache inventory (which cache reads which file):
              //   project.mapCache[name]  <- <map>/map.json            -> forgetMap(name)
              //   allMapsCache            <- every map's map.json      -> reset (warp renumber scan)
              //   worldCache              <- connections + layouts only, no event data; a commit edits events -> kept
              //   pngCache                <- blocks, layouts, tilesets -> cleared after the finally on success, below (a thrown commit returns 500 first; syncOverlay covers tileset bytes only)
              //   coverage/species/encounters caches <- wild_encounters.json, graphics/pokemon: a commit never writes them
              project.forgetMap(name); ctx.allMapsCache = undefined;
            }
          } catch (e) {
            console.error(e);
            return send(500, { error: e instanceof Error ? e.message : String(e) });
          }
          // The render route's pngCache (keyed `name:border`, no expiry) predates this write, and the session-bypass
          // above ends the moment the session closes above. Clear all of it: layouts can be shared by several maps and
          // one map serves both the border=0 and border=1 keys.
          pngCache.clear();
          return send(200, body);
        }).catch(error => {
          if (error instanceof BodyTooLarge) return send(413, { error: "request body too large" });
          const broken = brokenPathBody(error); if (broken) return send(409, broken);
          send(400, { error: error instanceof Error ? error.message : String(error) });
        });
      }

      // Task 9: event move/add/delete. Each is its own undo step, the same
      // snapshot-before/snapshot-after shape as the paint routes above --
      // this file doesn't need to know HOW to reverse an event op, only
      // that one whole op is one command (editSessions.ts's own
      // snapshotCommand).
      const eventMoveMatch = /^\/api\/edit\/(.+)\/event\/move$/.exec(url.pathname);
      if (eventMoveMatch && req.method === "POST") {
        const name = decodeSegment(eventMoveMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; index?: unknown; x?: unknown; y?: unknown; elevation?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.index !== "number" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
              return send(400, { error: `expected { kind, index: number, x: number, y: number }, got ${body}` });
            }
            if (parsed.elevation !== undefined && typeof parsed.elevation !== "number") {
              return send(400, { error: `"elevation" must be a number when present, got ${JSON.stringify(parsed.elevation)}` });
            }
            const entry = editEntryFor(name);
            const result = handleEventOp(entry, "move event", (map) => {
              const { map: nextMap, jsonEdits } = moveEvent(map, parsed.kind as EventKind, parsed.index as number, parsed.x as number, parsed.y as number, parsed.elevation as number | undefined);
              // The UI sends a CURRENT index; staged edits address the original file text (Plan H B3).
              const slot = eventSlot(entry.session, parsed.kind as EventKind, parsed.index as number);
              if (slot.pending) {
                entry.session.insertOps = entry.session.insertOps.map(op => op === slot.insert
                  ? { ...op, value: { ...(op.value as Record<string, unknown>), x: parsed.x as number, y: parsed.y as number, ...(parsed.elevation !== undefined ? { elevation: parsed.elevation as number } : {}) } } : op);
              } else {
                // A second move of the same original event replaces the first: editJson locates every edit in the
                // ORIGINAL text, so two edits at one path would overlap and write garbage (e.g. 5 -> 12 -> 3 saved "32").
                const moved = jsonEdits.map(edit => ({ ...edit, path: [edit.path[0]!, slot.original, ...edit.path.slice(2)] }));
                const key = (path: readonly (string | number)[]) => JSON.stringify(path);
                entry.session.jsonEdits = [...entry.session.jsonEdits.filter(old => !moved.some(edit => key(edit.path) === key(old.path))), ...moved];
              }
              return { map: nextMap };
            });
            return send(200, { ...overlayStamp(), map: result.map, isDirty: result.isDirty });
          })
          .catch((e: unknown) => {
            if (e instanceof BodyTooLarge) return send(413, { error: "request body too large" });
            const broken = brokenPathBody(e); if (broken) return send(409, broken);
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const eventAddMatch = /^\/api\/edit\/(.+)\/event\/add$/.exec(url.pathname);
      if (eventAddMatch && req.method === "POST") {
        const name = decodeSegment(eventAddMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; value?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.value !== "object" || parsed.value === null) return send(400, { error: `expected { kind, value: object }, got ${body}` });
            const entry = editEntryFor(name);
            const result = handleEventOp(entry, "add event", (map) => {
              const { map: nextMap, insertOp } = addEvent(map, parsed.kind as EventKind, parsed.value as Record<string, unknown>);
              entry.session.insertOps = [...entry.session.insertOps, { ...insertOp, index: appendIndex(entry.session, parsed.kind as EventKind) }];
              return { map: nextMap };
            });
            return send(200, { ...overlayStamp(), map: result.map, isDirty: result.isDirty });
          })
          .catch((e: unknown) => {
            if (e instanceof BodyTooLarge) return send(413, { error: "request body too large" });
            const broken = brokenPathBody(e); if (broken) return send(409, broken);
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const eventDeleteMatch = /^\/api\/edit\/(.+)\/event\/delete$/.exec(url.pathname);
      if (eventDeleteMatch && req.method === "POST") {
        const name = decodeSegment(eventDeleteMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: { kind?: unknown; index?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
            if (!EVENT_KINDS.has(parsed.kind as EventKind)) return send(400, { error: `"kind" must be one of object/warp/coord/bg, got ${JSON.stringify(parsed.kind)}` });
            if (typeof parsed.index !== "number") return send(400, { error: `expected { kind, index: number }, got ${body}` });
            const entry = editEntryFor(name);
            const result = handleEventOp(entry, "delete event", (map) => {
              const { map: nextMap, removeOp } = deleteEvent(map, parsed.kind as EventKind, parsed.index as number);
              // Staged ops speak original indices; deleting a pending add just drops its insert (Plan H B3).
              const slot = eventSlot(entry.session, parsed.kind as EventKind, parsed.index as number);
              if (slot.pending) {
                // A pending add takes the script edits it created with it (Plan H B4).
                if (slot.insert.owns) Object.assign(entry.session, dropOwnedScripts({ scriptAppends: entry.session.scriptAppends ?? [],
                  scriptReplaces: entry.session.scriptReplaces ?? [], newNames: entry.session.newNames ?? [] }, slot.insert.owns));
                entry.session.insertOps = dropPendingInsert(entry.session, parsed.kind as EventKind, slot.insert);
              }
              else entry.session.removeOps = [...entry.session.removeOps, { ...removeOp, index: slot.original }];
              const warpRenumberWarnings = parsed.kind === "warp" && !slot.pending
                ? findWarpsTargetingByIndex(getAllMapsForWarpScan().filter((m) => m.mapId !== map.id), map.id, slot.original)
                : [];
              return { map: nextMap, extra: warpRenumberWarnings };
            });
            return send(200, { ...overlayStamp(), map: result.map, isDirty: result.isDirty, warpRenumberWarnings: result.extra });
          })
          .catch((e: unknown) => {
            if (e instanceof BodyTooLarge) return send(413, { error: "request body too large" });
            const broken = brokenPathBody(e); if (broken) return send(409, broken);
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const indicatorSuggestMatch = /^\/api\/indicator\/(.+)\/suggestions$/.exec(url.pathname);
      if (indicatorSuggestMatch && req.method === "GET") {
        const name = decodeSegment(indicatorSuggestMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const suggestLayout = project.layoutById(project.map(name).layout);
        if (suggestLayout) refuseBrokenLayout(project, suggestLayout); // D25 (outside the try: a typed 409, not a 400)
        try {
          const names = gbaSpeciesNames(project);
          const occupied = editSessions.has(name)
            ? new Set(editEntryFor(name).session.map.objectEvents.map(({ x, y }) => `${x},${y}`)) : undefined;
          return send(200, {
            species: rankIndicatorSpecies(project, name).map(({ species, percent }) => {
              const bare = species.replace(/^SPECIES_/, "");
              const display = names.get(`SPECIES_${bare}`);
              if (display === undefined) throw new Error(`${project.paths.root}/src/data/text/species_names.h: missing ${species}`);
              return { species: bare, name: display, percent };
            }),
            placement: suggestIndicatorPlacement(project, name, occupied),
          });
        } catch (error) { return send(400, indicatorFailure(name, error)); }
      }

      const indicatorAtMatch = /^\/api\/edit\/(.+)\/indicator\/at$/.exec(url.pathname);
      if (indicatorAtMatch && req.method === "GET") {
        const name = decodeSegment(indicatorAtMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        try {
          const raw = url.searchParams.get("index");
          if (raw === null || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('"index" must be a non-negative integer');
          const session = editEntryFor(name).session;
          const event = session.map.objectEvents[Number(raw)];
          if (!event) return send(200, { indicator: null });
          let indicator = findGbaIndicator(effectiveGbaScripts(project, session), { script: event.script, graphics_id: event.graphicsId });
          if (indicator && session.map.objectEvents.filter(e => e.script === event.script).length > 1) {
            indicator = { ...indicator, editable: false, reason: "shared script" };
          }
          return send(200, { indicator });
        } catch (error) { return send(400, indicatorFailure(name, error)); }
      }

      const signAtMatch = /^\/api\/edit\/(.+)\/sign\/at$/.exec(url.pathname);
      if (signAtMatch && req.method === "GET") {
        const name = decodeSegment(signAtMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const xs = url.searchParams.get("x"), ys = url.searchParams.get("y");
        const x = Number(xs), y = Number(ys);
        if (xs === null || ys === null || !xs.trim() || !ys.trim() || !Number.isInteger(x) || !Number.isInteger(y)) return send(400, { error: '"x" and "y" must be integers' });
        try {
          const entry = editEntryFor(name);
          const event = entry.session.map.bgEvents.find(e => e.x === x && e.y === y);
          if (!event) return send(200, { kind: "empty" });
          if (event.type !== "sign") return send(200, { kind: "other", eventKind: event.type });
          const label = event.script as string;
          const block = findGbaSign(effectiveGbaScripts(project, entry.session), label);
          const baseline = block.marker?.hash ?? entry.signBaselines.get(label);
          return send(200, { kind: "sign", scriptLabel: label, editable: block.editable, reason: block.reason,
            mode: block.marker?.mode ?? null, text: block.paragraphs.map(p => p.join("\n")).join("\n\n"),
            handEdited: baseline !== undefined && (!block.editable || signHash(block.body) !== baseline) });
        } catch (error) { return send(400, signFailure(name, error)); }
      }

      const signEditMatch = /^\/api\/edit\/(.+)\/sign\/(put|resolve)$/.exec(url.pathname);
      if (signEditMatch && req.method === "POST") {
        const name = decodeSegment(signEditMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req).then(raw => {
          let body: Record<string, unknown>;
          try {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("body must be an object");
            body = parsed as Record<string, unknown>;
          } catch (error) { return send(400, { error: `invalid JSON body: ${(error as Error).message}` }); }
          const resolve = signEditMatch[2] === "resolve";
          if (resolve) {
            if (typeof body.scriptLabel !== "string") return send(400, { error: '"scriptLabel" must be a string' });
            if (body.action !== "refresh" && body.action !== "unlink") return send(400, { error: '"action" must be refresh or unlink' });
          } else {
            if (!Number.isInteger(body.x) || !Number.isInteger(body.y)) return send(400, { error: '"x" and "y" must be integers' });
            if (!["free", "name", "species"].includes(body.mode as string)) return send(400, { error: '"mode" must be free, name, or species' });
            if (typeof body.text !== "string") return send(400, { error: '"text" must be a string' });
            if (body.scriptLabel !== undefined && typeof body.scriptLabel !== "string") return send(400, { error: '"scriptLabel" must be a string' });
            if (body.force !== undefined && typeof body.force !== "boolean") return send(400, { error: '"force" must be a boolean' });
          }
          try {
            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            // Work only on a copy until every core operation has succeeded.
            const session = { ...entry.session };
            const text = effectiveGbaScripts(project, session);
            let command: string;
            if (resolve) {
              const block = findGbaSign(text, body.scriptLabel as string);
              if (!block.editable || !block.marker) throw new Error(block.reason ?? "sign has no marker");
              const mode = body.action === "unlink" ? "free" : block.marker.mode;
              const paragraphs = body.action === "unlink" ? block.paragraphs : gbaSignParagraphs(project, entry, mode, block.paragraphs.map(p => p.join("\n")).join("\n\n"));
              replaceGbaScripts(project, session, updateGbaSign(text, block, mode, paragraphs, { force: true }));
              command = `${body.action} sign`;
            } else {
              const x = body.x as number, y = body.y as number;
              if (x < 0 || y < 0 || x >= session.layout.width || y >= session.layout.height) throw new Error("sign coordinates outside map");
              const mode = body.mode as SignMode;
              const paragraphs = gbaSignParagraphs(project, entry, mode, body.text as string);
              const event = session.map.bgEvents.find(e => e.x === x && e.y === y);
              if (body.scriptLabel !== undefined) {
                if (!event || event.type !== "sign" || event.script !== body.scriptLabel) throw new Error("sign label does not match tile");
                const block = findGbaSign(text, body.scriptLabel as string);
                if (!block.editable) throw new Error(block.reason ?? "unsupported sign");
                replaceGbaScripts(project, session, updateGbaSign(text, block, mode, paragraphs,
                  { force: body.force === true, baselineHash: entry.signBaselines.get(body.scriptLabel as string) }));
                command = "update sign";
              } else {
                if (event) throw new Error(`tile already has ${event.type} event`);
                const reserved = session.map.bgEvents.map(e => `${e.script}::`).join("\n");
                const n = nextGbaSignNumber(text + "\n" + reserved, name);
                const label = `${name}_EventScript_PokemapSign${n}`;
                const added = addEvent(session.map, "bg", { type: "sign", x, y, elevation: 0,
                  player_facing_dir: "BG_EVENT_PLAYER_FACING_ANY", script: label });
                const eol = text.includes("\r\n") ? "\r\n" : "\n";
                let append = [...gbaSignScript(name, n), "", ...gbaSignText(name, n, mode, paragraphs)].join(eol) + (text.endsWith("\n") ? eol : "");
                // The last body may lack a newline; hash the bytes actually staged.
                append = append.replace(/^@ pokemap:sign [^\r\n]+/m, formatMarker("gba", mode, signHash(findGbaSign(append, label).body)));
                session.map = added.map;
                const pending = { path: project.paths.mapScriptsInc(name), text: append };
                session.insertOps = [...session.insertOps, { ...added.insertOp, index: appendIndex(session, "bg"), owns: { appends: [pending], newNames: [], slots: [] } }];
                session.scriptAppends = [...(session.scriptAppends ?? []), pending];
                // Appending after an unterminated EOF supplies the previous body's newline.
                // Re-hash only that previously clean marked body; keep hand edits protected.
                if (!text.endsWith("\n")) {
                  let combined = applyScriptAppend(text, pending);
                  const rehashed: [string, string][] = [];
                  for (const previous of gbaSignLabels(text)) {
                    const block = findGbaSign(text, previous);
                    if (!block.editable || !block.marker || block.marker.hash !== signHash(block.body)) continue;
                    const fresh = findGbaSign(combined, previous);
                    if (signHash(fresh.body) !== block.marker.hash) {
                      combined = updateGbaSign(combined, fresh, block.marker.mode, block.paragraphs, { force: true });
                      rehashed.push([block.marker.hash, findGbaSign(combined, previous).marker!.hash]);
                    }
                  }
                  if (combined !== applyScriptAppend(text, pending)) {
                    replaceGbaScripts(project, session, combined);
                    // An earlier pending sign's owned text now carries the new marker hash (Plan H B4).
                    session.insertOps = session.insertOps.map(op => !op.owns ? op : { ...op, owns: { ...op.owns,
                      appends: op.owns.appends.map(a => ({ ...a, text: rehashed.reduce((t, [from, to]) => t.split(from).join(to), a.text) })) } });
                  }
                }
                command = "place sign";
              }
            }
            const next = snapshotOf(session);
            if (JSON.stringify(prev) !== JSON.stringify(next)) entry.stack.push(entry.session, snapshotCommand(command, prev, next));
            return sendSession(send, 200, entry);
          } catch (error) { return send(400, signFailure(name, error)); }
        }).catch((error: unknown) => {
          if (error instanceof BodyTooLarge) return send(413, { error: "request body too large" });
          const broken = brokenPathBody(error); if (broken) return send(409, broken);
          send(400, signFailure(name, error));
        });
      }

      const indicatorEditMatch = /^\/api\/edit\/(.+)\/indicator\/(add|update)$/.exec(url.pathname);
      if (indicatorEditMatch && req.method === "POST") {
        const name = decodeSegment(indicatorEditMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req).then(raw => {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be an object");
            const body = parsed as Record<string, unknown>;
            if (typeof body.species !== "string" || typeof body.text !== "string") throw new Error('"species" and "text" must be strings');
            const species = body.species.toUpperCase().replace(/^SPECIES_/, "");
            const update = indicatorEditMatch[2] === "update";
            if (update) {
              if (!Number.isSafeInteger(body.index) || (body.index as number) < 0 || typeof body.scriptLabel !== "string") throw new Error('expected { index: non-negative integer, scriptLabel: string }');
            } else if (!Number.isSafeInteger(body.x) || !Number.isSafeInteger(body.y) || (body.elevation !== undefined && !Number.isSafeInteger(body.elevation))) {
              throw new Error('"x", "y" and optional "elevation" must be integers');
            }
            const entry = editEntryFor(name);
            const prev = snapshotOf(entry.session);
            const session = { ...entry.session };
            // Validate and build on a copy before publishing a single snapshot.
            const paragraphs = indicatorParagraphs(entry, body.text);
            const text = effectiveGbaScripts(project, session);
            let scriptLabel: string;
            if (update) {
              const event = session.map.objectEvents[body.index as number];
              if (!event || event.script !== body.scriptLabel) throw new Error("object script no longer matches this Indicator");
              const block = findGbaIndicator(text, { script: event.script, graphics_id: event.graphicsId });
              if (!block?.editable) throw new Error(block?.reason ?? "object is not an editable Indicator");
              if (session.map.objectEvents.filter(e => e.script === event.script).length > 1) throw new Error("shared script");
              // The existing label belongs to this block; validate species without treating it as a new definition.
              const guard = guardGbaIndicatorWrite(project.paths.root, name, block.scriptLabel, species).filter(r => r.code !== "SIGN_LABEL_EXISTS");
              if (guard.length) return send(400, { refusals: guard });
              const after = updateGbaIndicator(text, block, species, paragraphs);
              if (event.graphicsId !== gbaIndicatorGraphics(species)) {
                const changed = setObjectGraphics(session.map, body.index as number, gbaIndicatorGraphics(species));
                session.map = changed.map;
                // Fold a staged object's graphics change into its insert; an original object takes a
                // scalar edit at its ORIGINAL index (the UI sent a current one, Plan H B3).
                const slot = eventSlot(session, "object", body.index as number);
                if (slot.pending) {
                  session.insertOps = session.insertOps.map(op => op === slot.insert
                    ? { ...op, value: { ...(op.value as Record<string, unknown>), graphics_id: gbaIndicatorGraphics(species) } } : op);
                } else session.jsonEdits = [...session.jsonEdits.filter(edit => !(edit.path[0] === "object_events" && edit.path[1] === slot.original && edit.path[2] === "graphics_id")),
                  ...changed.jsonEdits.map(edit => ({ ...edit, path: [edit.path[0]!, slot.original, ...edit.path.slice(2)] }))];
              }
              if (after !== text) replaceGbaScripts(project, session, after);
              scriptLabel = block.scriptLabel;
            } else {
              const x = body.x as number, y = body.y as number;
              if (x < 0 || y < 0 || x >= session.layout.width || y >= session.layout.height) throw new Error("Indicator coordinates outside map");
              const built = buildGbaIndicator(name, text, session.map.objectEvents.map(e => e.script), {
                x, y, elevation: (body.elevation as number | undefined) ?? 0, species, paragraphs,
              });
              const refusals = guardGbaIndicatorWrite(project.paths.root, name, built.scriptLabel, species);
              if (refusals.length) return send(400, { refusals });
              const added = addEvent(session.map, "object", built.objectEvent);
              session.map = added.map;
              const pending = { path: project.paths.mapScriptsInc(name), text: built.scriptAppendText };
              session.insertOps = [...session.insertOps, { ...added.insertOp, index: appendIndex(session, "object"), owns: { appends: [pending], newNames: [], slots: [] } }];
              session.scriptAppends = [...(session.scriptAppends ?? []), pending];
              scriptLabel = built.scriptLabel;
            }
            const next = snapshotOf(session);
            if (JSON.stringify(prev) !== JSON.stringify(next)) entry.stack.push(entry.session, snapshotCommand(update ? "update Indicator" : "place Indicator", prev, next));
            return send(200, { ...overlayStamp(), map: entry.session.map, isDirty: entry.session.isDirty, ...(update ? {} : { scriptLabel }) });
          } catch (error) { return send(400, indicatorFailure(name, error)); }
        }).catch(error => {
          if (error instanceof BodyTooLarge) return send(413, { error: "request body too large" });
          const broken = brokenPathBody(error); if (broken) return send(409, broken);
          send(400, indicatorFailure(name, error));
        });
      }
      fellThrough = true;
    })();
    return !fellThrough;
  };
}
