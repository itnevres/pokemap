import { BodyTooLarge, decodeSegment, readBody, refuseOversize, sendJson } from "./http.js";
import { createGbaBlockEditRoutes } from "./blockEditRoutes.js";
import { syncTilesetOverlay, type OverlayState } from "./tilesetOverlay.js";
import { requireTilesetOwnership, refuseUnsavedBlockRefs, savedMetatileCount } from "./blockEditOwnership.js";
import { checkTilesetBaselines } from "@pokemap/core/src/blockEdit/save.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { BlockEditRefusal } from "@pokemap/core/src/blockEdit/types.js";
import { createGbaAddEventRoutes, eventFailure, type AddEventHooks } from "./addEventRoutes.js";
import { createSymbolIndexCache } from "./projectSymbols.js";
import { gbaSpeciesNames } from "@pokemap/core/src/signs/linked.js";
import { parseMap } from "@pokemap/core/src/load/maps.js";
import { findGbaSign, gbaSignScript, gbaSignText, nextGbaSignNumber, updateGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { formatMarker, signHash, type SignMode } from "@pokemap/core/src/signs/marker.js";
import { effectiveGbaScripts, gbaSignLabels, gbaSignParagraphs, refreshGbaLinkedSigns, replaceGbaScripts } from "./signRefresh.js";
import { readFileSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { detectEngineFamily } from "@pokemap/core/src/family.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import { createGbcProjectHandler } from "./gbcRoutes.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { parseEncounters, type Encounters } from "@pokemap/core/src/load/encounters.js";
import { coverage, whereSpecies, allSpecies } from "@pokemap/core/src/analyse/coverage.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { warpConnectedMapsFrom } from "@pokemap/core/src/world/warpGraph.js";
import { sidecarRoutes } from "./sidecarRoutes.js";
import { gbaReadRoutes } from "./gbaReadRoutes.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { randomUUID } from "node:crypto";
import { createEditSessionStore, snapshotOf, snapshotCommand } from "./editSessions.js";
import { brokenPathBody, brokenPathOfLayout, refusalBody, refuseBrokenLayout } from "./brokenComponents.js";
import { paintCells, floodFill, shiftGrid, type Stamp } from "@pokemap/core/src/edit/paint.js";
import { applyScriptAppend, planSave, prepareSave, commitSave, type EditSession } from "@pokemap/core/src/write/save.js";
import { planFingerprint, type AtomicEntry } from "@pokemap/core/src/write/atomic.js";
import { formatDiffJson } from "@pokemap/core/src/write/diff.js";
import { moveEvent, addEvent, deleteEvent, setObjectGraphics, findWarpsTargetingByIndex, eventSlot, appendIndex, dropPendingInsert, dropOwnedScripts, type EventKind } from "@pokemap/core/src/edit/events.js";
import { rankIndicatorSpecies, suggestIndicatorPlacement } from "@pokemap/core/src/signs/suggest.js";
import { buildGbaIndicator, guardGbaIndicatorWrite, findGbaIndicator, updateGbaIndicator, gbaIndicatorGraphics } from "@pokemap/core/src/indicator/gba.js";

import { warmEach, type WarmResult } from "./warmUp.js";

/**
 * A discriminated union on `family` (Plan 6b task spec) -- the gbc branch's
 * `project` is a `GbcProject`, not the GBA `Project` every route below this
 * type still assumes. No test reads `.project` directly (checked by grep,
 * plan review "Verified correct"), so this widening never touches any
 * existing GBA-side call site.
 */
export type PokemapServer =
  | { port: number; close(): Promise<void>; family: "gba"; project: Project }
  | { port: number; close(): Promise<void>; family: "gbc"; project: GbcProject };

/**
 * The hub-swappable core of a server (Plan 6c A1): everything `createServer`
 * used to build BEFORE `createHttp`/`listen`, minus the `node:http` plumbing
 * itself -- one `node:http.Server` (owned by `createServer` below, and by
 * `hub.ts`) can point `handle` at a fresh `ProjectHandler` on every
 * `/api/hub/open`, with no listener restart. `createProjectHandler` is
 * synchronous (both `openProject` and `openGbcProject` already are) so a
 * hub's "open new, then swap" is race-free: nothing can arrive between the
 * two steps because there is no await between them.
 *
 * `dirtyMaps()`/`dispose()` are what let the hub enforce "don't silently
 * discard unsaved edits" (`/api/hub/open`'s dirty-check) and "an in-flight
 * request against a just-replaced handler must not touch it any further"
 * (the disposed-503 guard at the top of `handle`) without the hub needing to
 * know anything about editSessions.ts.
 */
export type ProjectHandler =
  | {
      family: "gba"; project: Project; info: ProjectInfo;
      handle(req: IncomingMessage, res: ServerResponse): void;
      dirtyMaps(): string[]; dispose(): void;
      warmUp(names?: string[]): Promise<WarmResult>;
    }
  | {
      family: "gbc"; project: GbcProject; info: ProjectInfo;
      handle(req: IncomingMessage, res: ServerResponse): void;
      dirtyMaps(): string[]; dispose(): void;
      warmUp(names?: string[]): Promise<WarmResult>;
    };

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

export function createProjectHandler(root: string, hooks: AddEventHooks = {}): ProjectHandler {
  if (detectEngineFamily(root) === "gbc") return createGbcProjectHandler(root, hooks);

  const project = openProject(root);
  const symbols = createSymbolIndexCache(root, "gba");

  // Unbounded on purpose for now, and worth knowing why: the whole corpus is
  // 1,209 maps and the largest PNG is a few hundred KB, but Route47 at
  // 1920x976 is not, and a client that walks every map pins all of it. Task 23
  // designs the real cache with an eviction policy; until then this is a
  // single-user dev server and the ceiling is understood rather than enforced.
  const pngCache = new Map<string, Buffer>();

  // buildWorld walks all 1,209 maps' connections (~4s against the real
  // corpus, per packages/core/test/world/connections.test.ts) and the
  // project is read-only for all of Plan 1, so its answer can never change
  // for the lifetime of one server process. Computed at most once, on the
  // first request that needs it -- not eagerly at startup, so routes that
  // never touch /api/world (most of api.test.ts) don't pay for it.
  let worldCache: ReturnType<typeof buildWorld> | undefined;
  const getWorld = () => (worldCache ??= buildWorld(project));

  // Plan H H-b: the seven sidecar routes both server families share. GBA's
  // own deps: its project map names for `knownMap`, `warpConnectedMapsFrom`
  // for the dungeon seed BFS, and the `{ ok: true }` reply
  // `world.test.ts` pins for `POST /api/world/dungeons`.
  const sidecarRoute = sidecarRoutes({
    root: project.paths.root,
    getWorld,
    knownMap: (name) => project.mapNames().includes(name),
    expandSeed: (seedMap) => warpConnectedMapsFrom(project, seedMap),
    autoLayoutReply: () => ({ ok: true }),
  });

  // Shared render helper used by both the /api/render route and warmUp.
  // Returns the cached PNG for `${name}:${border}`, or resolves the layout,
  // renders, caches, and returns it; undefined when the name resolves to no
  // layout (route answers 404 as today).
  const cachedRender = (name: string, border: number): Buffer | undefined => {
    syncOverlay();
    const key = `${name}:${border}`;
    let png = pngCache.get(key);
    if (png) return png;
    // Same resolution as the route's resolveLayoutName: a layout name, or a map's own layout; never throws.
    const layoutName = project.layoutByName(name)
      ? name
      : project.mapNames().includes(name) ? project.layoutById(project.map(name).layout)?.name : undefined;
    if (!layoutName) return undefined;
    // D25: a broken layout or tileset is refused (409 at the route), never rendered.
    refuseBrokenLayout(project, project.layoutByName(layoutName)!);
    png = encodePng(renderLayout(project, layoutName, { border }));
    pngCache.set(key, png);
    return png;
  };

  // Species icon PNGs, keyed by species+source+frame -- same reasoning and
  // the same "unbounded for now" ceiling as pngCache above, but with far less
  // to hold: at most a few thousand 32x32 frames across the whole species
  // list, not one entry per map.
  const iconCache = new Map<string, Buffer>();

  // wild_encounters.json is parsed once and reused for the lifetime of this
  // (read-only, per-process) server -- same reasoning as worldCache above.
  let encountersCache: Encounters | undefined;
  const getEncounters = () => (encountersCache ??= parseEncounters(readFileSync(project.paths.wildEncountersJson, "utf8")));

  // coverage(project) walks all 497 tables across every map (Task 29) --
  // same "read-only project, compute once" reasoning as worldCache and
  // encountersCache just above: the project can never change out from
  // under a live server process (I8), so the answer can't either. Computed
  // on the first request that actually needs it (/api/coverage), not
  // eagerly at startup. whereSpecies is NOT cached here -- it takes a
  // species argument and returns a different answer per call, so there is
  // nothing shaped like "the one answer" to memoize the way there is for
  // coverage()'s single, argument-free result.
  let coverageCache: ReturnType<typeof coverage> | undefined;
  const getCoverage = () => (coverageCache ??= coverage(project));

  // allSpecies(project) reads one directory listing -- cheap even
  // uncached, but the result can't change for the lifetime of a
  // read-only-decomp server process (I8), same reasoning as every other
  // cache in this file. Computed on the first request that needs it.
  let speciesCache: string[] | undefined;
  const getSpecies = () => (speciesCache ??= allSpecies(project));

  // Cached for the SAME "read-only project, compute once" reason as
  // worldCache/coverageCache -- findWarpsTargetingByIndex's own corpus scan
  // is cheap per call (a plain array walk over already-parsed MapData) but
  // building the (mapId, MapData) list itself means calling project.map()
  // for all 1,209 names, which is worth doing once rather than per delete.
  // Same staleness caveat as the commit route's own comment below: a commit
  // on map A changes A's warp events on disk but NOT this cache's copy of
  // A (built from project.map(), which commitSave never invalidates) -- a
  // later /event/delete on map B computes warpRenumberWarnings against
  // A's PRE-commit warps until this whole process restarts. Accepted for
  // the same reason worldCache/coverageCache/etc. are: I8 assumed a
  // read-only project when every one of these caches was designed, and
  // Task 9 is the first task to make that assumption stale for one map at
  // a time; a real invalidation story is out of scope here.
  let allMapsCache: { mapId: string; map: ReturnType<Project["map"]> }[] | undefined;
  const getAllMapsForWarpScan = () => (allMapsCache ??= project.mapNames().map((n) => ({ mapId: project.map(n).id, map: project.map(n) })));

  const EVENT_KINDS = new Set<EventKind>(["object", "warp", "coord", "bg"]);

  // A reopened edit session must see map.json written by the previous commit.
  const editSessions = createEditSessionStore({ ...project,
    map: (name) => parseMap(readFileSync(project.paths.mapJson(name), "utf8")),
  });

  const overlayState: OverlayState = { instance: randomUUID(), version: 0, applied: new Map(), clearCaches: () => pngCache.clear() };
  const syncOverlay = () => syncTilesetOverlay(editSessions.entries(), project, overlayState);
  const overlayStamp = (): { tilesetVersion: number; tilesetInstance: string } => ({
    tilesetVersion: syncOverlay(), tilesetInstance: overlayState.instance,
  });

  const addEvents = createGbaAddEventRoutes(project, editSessions, hooks, symbols);

  const editEntryFor = (name: string) => editSessions.open(name);

  const signFailure = (name: string, error: unknown) => ({ refusals: [{
    code: error instanceof Error && error.message === "hand-edited" ? "hand-edited" : "sign",
    fix: "Check the named source or sign text; refresh or unlink hand-edited signs explicitly.",
    subject: project.paths.mapScriptsInc(name), message: error instanceof Error ? error.message : String(error),
  }] });
  const indicatorCharmapPath = `${project.paths.root}/charmap.txt`;
  const indicatorCharmapFix = "Restore a valid subject charmap and correct unsupported Indicator text before retrying.";
  const indicatorFailure = (name: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const charmap = message.startsWith(`${indicatorCharmapPath}:`);
    return { refusals: [{ code: "indicator", subject: charmap ? indicatorCharmapPath : project.paths.mapScriptsInc(name), message,
      fix: charmap ? indicatorCharmapFix : "Check the named source, restore the generated Indicator shape, or correct the species and text before retrying.",
    }] };
  };
  function indicatorParagraphs(entry: ReturnType<typeof editEntryFor>, text: string): string[][] {
    try { return gbaSignParagraphs(project, entry, "free", text); }
    catch (error) { throw new Error(`${indicatorCharmapPath}: ${error instanceof Error ? error.message : String(error)}. ${indicatorCharmapFix}`); }
  }
  function signPlan(name: string) {
    const refreshed = refreshGbaLinkedSigns(project, editEntryFor(name));
    const checkNames = addEvents.freshCheck(name);
    const plan = planSave(project, refreshed.session, { checkNames });
    let prepared: AtomicEntry[] = [];
    let prepareError: unknown;
    if (plan.refusals.length === 0) {
      try { prepared = prepareSave(project, plan.session, { checkNames }); }
      catch (error) { prepareError = error instanceof Error ? error : new Error(String(error)); }
    }
    // A prepare failure (a planned target unreadable) is shown in the plan as a located refusal, so the dialog says why Save is off.
    const diff = formatDiffJson(plan);
    const refusals = prepareError === undefined ? diff.refusals : [...diff.refusals, { code: "SAVE_PREPARE_FAILED", subject: name,
      message: `Could not read the files this save would write: ${(prepareError as Error).message}`,
      fix: "Close any program holding the file or fix its permissions, then reopen Save" }];
    return { plan, prepared, prepareError, checkNames, body: { ...diff, tilesetEffects: plan.tilesetEffects, refusals, signNotices: refreshed.notices,
      fingerprint: plan.refusals.length > 0 || prepareError !== undefined ? null : planFingerprint(prepared),
    } };
  }


  // `map` is included alongside blocks/border/isDirty (added for Task 9):
  // undo/redo are shared by every edit kind, including event moves/adds/
  // deletes, which mutate session.map rather than session.blocks -- without
  // this, undoing an event op would report the reverted blocks/border but
  // leave the client's own map view silently stale.
  //
  // canUndo/canRedo (Task 13): the Toolbar's own Undo/Redo buttons need to
  // know whether there's anything to undo/redo without guessing client-side
  // -- entry.stack already tracks this exactly (see EditCommandStack's own
  // canUndo()/canRedo()), so every route that touches the stack (paint end,
  // undo, redo, and the event-op routes below) reports it for free through
  // this one shared response shape.
  const sendSession = (send: (code: number, body: unknown) => void, code: number, entry: ReturnType<typeof editEntryFor>) => {
    // `syncOverlay()` first, then the counts: `project.tileset` is what the overlay replaces, so
    // a session with a staged tileset edit reports the GROWN count here (see the /api/map route).
    const stamp = overlayStamp();
    // Plan 14.2 fix hop A: the map payload's own `primaryCount`/`secondaryCount`, recomputed on
    // every session reply (`/api/map` lines above are the same computation) so the client's
    // MetatilePalette follows a block appended by the block editor's "Save as new" without a map
    // refetch -- and shrinks back on the undo of that append. Omitted when the layout is missing.
    const layout = project.layoutById(entry.session.map.layout);
    const counts = layout
      ? { primaryCount: project.tileset(layout.primaryTileset).metatileCount,
          secondaryCount: project.tileset(layout.secondaryTileset).metatileCount }
      : {};
    return send(code, {
      ...stamp,
      blocks: entry.session.blocks, border: entry.session.border, map: entry.session.map, isDirty: entry.session.isDirty,
      canUndo: entry.stack.canUndo(), canRedo: entry.stack.canRedo(),
      ...counts,
    });
  };

  const blockEdits = createGbaBlockEditRoutes({
    project, store: editSessions, syncOverlay, overlay: () => overlayState.applied,
    hasMap: name => project.mapNames().includes(name),
    sessionBody: name => {
      let body: unknown;
      sendSession((_code, payload) => { body = payload; }, 200, editEntryFor(name));
      return body;
    },
  });

  // Plan H I1: the read-only GBA routes. Built here, after every value they read
  // is initialised (the sidecar mount above sits earlier, before `syncOverlay` etc. exist).
  const gbaReadRoute = gbaReadRoutes({
    project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor,
    cachedRender, pngCache, iconCache, getWorld, getEncounters, getCoverage, getSpecies,
  });

  // Shared by all three event routes below: the prev-snapshot / mutate /
  // push-undo-command sequence is identical across move/add/delete, only
  // (a) which core function to call, (b) which of jsonEdits/insertOps/
  // removeOps to append to, and (c) any extra per-route response data
  // (delete's warpRenumberWarnings) differ -- those stay in each route's
  // own `op` callback rather than becoming parameters here, since forcing
  // them into a generic shape would just move the duplication into this
  // function's own signature instead of removing it.
  function handleEventOp<T = undefined>(
    entry: ReturnType<typeof editEntryFor>, label: string,
    op: (map: EditSession["map"]) => { map: EditSession["map"]; extra?: T },
  ): { map: EditSession["map"]; isDirty: boolean; extra?: T } {
    const prev = snapshotOf(entry.session);
    const { map, extra } = op(entry.session.map);
    entry.session.map = map;
    entry.stack.push(entry.session, snapshotCommand(label, prev, snapshotOf(entry.session)));
    return { map: entry.session.map, isDirty: entry.session.isDirty, extra };
  }

  // Set by `dispose()` below -- an in-flight request that already holds this
  // exact handler (captured before a `/api/hub/open` swap completed) must not
  // read or write through it any further once it's no longer current. Every
  // route past this point is unreachable once disposed; the 503 is the whole
  // guard.
  let disposed = false;

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (disposed) {
      sendJson(res, 503, { error: "project closed" });
      return;
    }
    // ponytail: this guard only catches a request whose HEADERS arrive
    // before a swap. A POST route below awaits `readBody(req)` before doing
    // any real work -- if the swap (and this handler's own `dispose()`)
    // lands during that await, the body-handling code still runs against
    // this now-disposed handler's `project`/`editSessions` and can answer
    // 200 from a store that's already been torn down (spec review F3,
    // deferred as a later task -- fixing it touches every async route body,
    // not just this guard). Upgrade path: re-check `disposed` after
    // `readBody` resolves, e.g. by having `readBody` itself reject with a
    // 503 when the handler that awaited it is no longer current.
    //
    // S3: refuse a body that already declares itself oversize before any
    // route runs -- the cheap half of the cap. `readBody`'s own streaming
    // limit is the backstop for a chunked body that declares no length: every
    // `readBody` rejection path below answers 413 for `BodyTooLarge`, so a
    // chunked oversize body gets the same 413. The connection is kept (see
    // `refuseOversize`).
    if (refuseOversize(req, res)) return;
    const url = new URL(req.url ?? "/", "http://localhost");
    // One-line over `sendJson` so the `Send` type the route modules
    // (addEventRoutes, gbcEditRoutes, blockEditRoutes) receive is unchanged.
    const send = (code: number, body: unknown) => sendJson(res, code, body);

    try {
      // D25: every edit route (except the no-op session/undo/redo/discard, which have no session to act on) refuses a map whose
      // layout or tileset path leaves the project, before any route reads or opens anything. editSessions.open() refuses too.
      const editGate = /^\/api\/edit\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (editGate && !/^(session|undo|redo|discard)$/.test(editGate[2]!)) {
        const gateName = decodeSegment(editGate[1]!);
        if (gateName !== undefined && project.mapNames().includes(gateName)) {
          let gateBroken: ReturnType<typeof brokenPathOfLayout>;
          try {
            const gateLayout = project.layoutById(project.map(gateName).layout);
            gateBroken = gateLayout && brokenPathOfLayout(project, gateLayout);
          } catch { /* unparseable map.json etc.: let the route answer as it did before the gate */ }
          if (gateBroken) return send(409, refusalBody(gateBroken));
        }
      }
      if (blockEdits.handle(req, url, (code, body) => {
        if (Buffer.isBuffer(body)) {
          res.writeHead(code, { "content-type": "image/png", "cache-control": "no-cache" });
          res.end(body);
        } else send(code, body);
      })) return;
      const createEventMatch = /^\/api\/edit\/([^/]+)\/event\/create$/.exec(url.pathname);
      if (createEventMatch && req.method === "POST") {
        const name = decodeSegment(createEventMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return void readBody(req).then(text => {
          if (disposed) return send(503, { error: "project closed" });
          try { const body = addEvents.create(name, JSON.parse(text)); send(200, { ...body, ...overlayStamp() }); }
          catch (error) { send(400, eventFailure("gba", name, error)); }
        }).catch(error => {
          if (error instanceof BodyTooLarge) return send(413, { error: "request body too large" });
          const broken = brokenPathBody(error); if (broken) return send(409, broken);
          send(400, eventFailure("gba", name, error));
        });
      }
      // Plan H I1: the read-only GBA routes (event/indicator option lookups, project, groups, defects, map,
      // render, metatile, species icon, encounters, warps, coverage, species, where, world) live in gbaReadRoutes.ts.
      // The option-lookup block that used to sit above `createEventMatch` now runs below it: they are disjoint
      // (that block only answers GET option lookups, `createEventMatch` only POST /api/edit/<name>/event/create).
      if (gbaReadRoute(req, res, url, send)) return;

      // Plan H H-b: the seven sidecar routes both families share live in
      // sidecarRoutes.ts, mounted here where the first of them
      // (`/api/world/conflicts/accept`) used to sit -- i.e. AFTER the
      // `/api/world` payload above, which must keep priority on its own
      // exact path.
      if (sidecarRoute(req, url, send)) return;

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
      // to disk state" -- editSessions.ts's own close() already does exactly
      // this (sessions.delete(mapName)); this route is just the first thing
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
        // close()'s own "always safe to drop" doc comment.
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
              project.forgetMap(name); allMapsCache = undefined;
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

      return send(404, { error: "not found" });
    } catch (e) {
      const broken = brokenPathBody(e);
      if (broken) return send(409, broken);
      console.error(e);
      return send(500, { error: (e as Error).message });
    }
  };

  const warmUp = async (names?: string[]): Promise<WarmResult> => {
    // Compute the default list inside the first yield so warmUp() returns at once.
    const nameList = names ?? await new Promise<string[]>((resolve) => {
      setImmediate(() => {
        if (disposed) return resolve([]);
        // A throw here (world build) must not become an unhandled rejection in the hub's fire-and-forget call.
        try {
          const world = getWorld();
          const sidecar = readSidecar(project.paths.root);
          const merged = resolveWorldPlacements(project, world, sidecar, { dungeons: true });
          // The UI's isDrawnByDefault rule (packages/ui/src/world/visibility.ts HIDDEN_MAP_TYPES): the tiles a World open requests.
          const HIDDEN = new Set(["MAP_TYPE_INDOOR", "MAP_TYPE_NONE"]);
          const known = new Set(project.mapNames());
          const result: string[] = [];
          for (const name of merged.keys()) {
            const manual = name in sidecar.manualPlacements;
            const mapType = known.has(name) ? project.map(name).mapType : "MAP_TYPE_NONE";
            if (manual || !HIDDEN.has(mapType)) result.push(name);
          }
          resolve(result);
        } catch (e) {
          console.warn(`pokemap warm: world list: ${e instanceof Error ? e.message : String(e)}`);
          resolve([]);
        }
      });
    });

    return warmEach(nameList, (name) => {
      if (editSessions.has(name)) return "skipped";
      const key = `${name}:0`;
      if (pngCache.has(key)) return "skipped";
      let png: Buffer | undefined;
      try { png = cachedRender(name, 0); }
      catch (e) { if (brokenPathBody(e)) return "skipped"; throw e; } // a broken layout/tileset is a defect, not a warm-up failure
      if (!png) throw new Error(`no layout or map ${name}`);
      return "rendered";
    }, () => disposed);
  };

  return {
    family: "gba",
    project,
    info: { family: "gba", root: project.paths.root },
    handle,
    dirtyMaps: () => editSessions.dirty(),
    dispose: () => {
      symbols.invalidate(); addEvents.invalidate();
      editSessions.closeAll();
      disposed = true;
    },
    warmUp,
  };
}

/**
 * Thin wrapper around `createProjectHandler`: owns the one `node:http`
 * listener a standalone (non-hub) server needs, for every existing test file
 * and CLI-adjacent caller that still wants "one project, one server,
 * one port" rather than the hub's swappable handler. Behaviour-identical to
 * the pre-split `createServer` (same listen/port/close shape) -- this is the
 * proof the handler split above is a mechanical move, not a behaviour change.
 */
export async function createServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer> {
  const h = createProjectHandler(opts.projectPath);
  const http: Server = createHttp(h.handle);

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);
  const close = () => new Promise<void>((r) => http.close(() => r()));

  if (h.family === "gba") return { port, family: "gba", project: h.project, close };
  return { port, family: "gbc", project: h.project, close };
}
