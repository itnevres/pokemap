import { decodeSegment, isCrossOriginRequest, refuseNonJsonBody, refuseOversize, sendJson } from "./http.js";
import { createGbaBlockEditRoutes } from "./blockEditRoutes.js";
import { syncTilesetOverlay, type OverlayState } from "./tilesetOverlay.js";
import { createGbaAddEventRoutes, type AddEventHooks } from "./addEventRoutes.js";
import { createSymbolIndexCache } from "./projectSymbols.js";
import { parseMap } from "@pokemap/core/src/load/maps.js";
import { gbaSignParagraphs, refreshGbaLinkedSigns } from "./signRefresh.js";
import { readFileSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { detectEngineFamily } from "@pokemap/core/src/family.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import { createGbcProjectHandler } from "./gbcRoutes.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { parseEncounters, type Encounters } from "@pokemap/core/src/load/encounters.js";
import { coverage, allSpecies } from "@pokemap/core/src/analyse/coverage.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { warpConnectedMapsFrom } from "@pokemap/core/src/world/warpGraph.js";
import { sidecarRoutes } from "./sidecarRoutes.js";
import { gbaReadRoutes } from "./gbaReadRoutes.js";
import { gbaEditRoutes } from "./gbaEditRoutes.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { randomUUID } from "node:crypto";
import { createEditSessionStore, snapshotOf, snapshotCommand } from "./editSessions.js";
import { brokenPathBody, brokenPathOfLayout, refusalBody, refuseBrokenLayout } from "./brokenComponents.js";
import { planSave, prepareSave, type EditSession } from "@pokemap/core/src/write/save.js";
import { planFingerprint, type AtomicEntry } from "@pokemap/core/src/write/atomic.js";
import { formatDiffJson } from "@pokemap/core/src/write/diff.js";
import { type EventKind } from "@pokemap/core/src/edit/events.js";

import { warmEach, type WarmResult } from "./warmUp.js";
import { errorMessage } from "@pokemap/core/src/errorMessage.js";

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
  // Historical staleness caveat (the commit route in gbaEditRoutes.ts now resets this cache, Plan H G2): a commit
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
    subject: project.paths.mapScriptsInc(name), message: errorMessage(error),
  }] });
  const indicatorCharmapPath = `${project.paths.root}/charmap.txt`;
  const indicatorCharmapFix = "Restore a valid subject charmap and correct unsupported Indicator text before retrying.";
  const indicatorFailure = (name: string, error: unknown) => {
    const message = errorMessage(error);
    const charmap = message.startsWith(`${indicatorCharmapPath}:`);
    return { refusals: [{ code: "indicator", subject: charmap ? indicatorCharmapPath : project.paths.mapScriptsInc(name), message,
      fix: charmap ? indicatorCharmapFix : "Check the named source, restore the generated Indicator shape, or correct the species and text before retrying.",
    }] };
  };
  function indicatorParagraphs(entry: ReturnType<typeof editEntryFor>, text: string): string[][] {
    try { return gbaSignParagraphs(project, entry, "free", text); }
    catch (error) { throw new Error(`${indicatorCharmapPath}: ${errorMessage(error)}. ${indicatorCharmapFix}`); }
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
  // undo, redo, and the event-op routes in gbaEditRoutes.ts) reports it for free through
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

  // Shared by all three event routes (gbaEditRoutes.ts): the prev-snapshot / mutate /
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

  // Plan H I2b: the GBA edit-session routes. Built here, after `handleEventOp`, `signPlan`, `sendSession` and every
  // other value they read exist. `disposed` and `allMapsCache` are `let`s that are reassigned, so they go through accessors.
  const gbaEditRoute = gbaEditRoutes({
    project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, pngCache,
    signFailure, indicatorFailure, indicatorParagraphs, signPlan, sendSession, handleEventOp,
    getAllMapsForWarpScan, EVENT_KINDS, get disposed() { return disposed; },
    get allMapsCache() { return allMapsCache; }, set allMapsCache(value) { allMapsCache = value; },
  });

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (disposed) {
      sendJson(res, 503, { error: "project closed" });
      return;
    }
    // ponytail: this guard only catches a request whose HEADERS arrive
    // before a swap. A POST route (gbaEditRoutes.ts) awaits `readBody(req)` before doing
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
    // `readBody` rejection path in the route modules answers 413 for `BodyTooLarge`, so a
    // chunked oversize body gets the same 413. The connection is kept (see
    // `refuseOversize`).
    if (refuseOversize(req, res)) return;
    if (refuseNonJsonBody(req, res)) return;
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
      // Plan H I1: the read-only GBA routes (event/indicator option lookups, project, groups, defects, map,
      // render, metatile, species icon, encounters, warps, coverage, species, where, world) live in gbaReadRoutes.ts.
      // The option-lookup block used to run after `createEventMatch` (now in gbaEditRoutes.ts): they are disjoint
      // (that block only answers GET option lookups, `createEventMatch` only POST /api/edit/<name>/event/create).
      if (gbaReadRoute(req, res, url, send)) return;

      // Plan H H-b: the seven sidecar routes both families share live in
      // sidecarRoutes.ts, mounted here where the first of them
      // (`/api/world/conflicts/accept`) used to sit -- i.e. AFTER the
      // `/api/world` payload above, which must keep priority on its own
      // exact path.
      if (sidecarRoute(req, url, send)) return;

      // Plan H I2b: the paint/session/commit/event/sign/Indicator routes live in gbaEditRoutes.ts. Its first route
      // (POST /api/edit/<name>/event/create) used to sit above the read-route mount; it runs here now. Disjoint paths:
      // no read route, no sidecar route and no blockEdits route matches POST /api/edit/<name>/event/create.
      if (gbaEditRoute(req, res, url, send)) return;

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
          console.warn(`pokemap warm: world list: ${errorMessage(e)}`);
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
  // The standalone server answers the same cross-origin refusal the hub does (Plan H J3).
  const http: Server = createHttp((req, res) => {
    if (isCrossOriginRequest({ origin: req.headers.origin, host: req.headers.host })) {
      sendJson(res, 403, { error: "cross-origin request refused" });
      return;
    }
    h.handle(req, res);
  });

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);
  const close = () => new Promise<void>((r) => http.close(() => r()));

  if (h.family === "gba") return { port, family: "gba", project: h.project, close };
  return { port, family: "gbc", project: h.project, close };
}
