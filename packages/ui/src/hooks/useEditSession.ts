import { useCallback, useEffect, useState } from "react";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { EventKind, WarpRenumberWarning } from "@pokemap/core/src/edit/events.js";

export type PaintApplyBody =
  | { tool: "pencil"; targets: { x: number; y: number }[]; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "rect"; x0: number; y0: number; x1: number; y1: number; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "bucket"; x: number; y: number; replacement: { metatileId: number; collision?: number; elevation?: number } }
  | { tool: "shift"; dx: number; dy: number };

export interface UseEditSessionResult {
  blocks: Block[];
  border: Block[];
  /** Task 14: live-edited map data (object/warp/coord/bg events) -- the
   *  SAME live/static split `blocks` already has (Task 11), for the same
   *  reason: moveEvent/addEvent/deleteEvent below mutate `session.map`
   *  server-side (handleEventOp, packages/server/src/index.ts), not
   *  `session.blocks`/`session.border` (the paint routes' own target), so
   *  MapCanvas's event markers need this to see an edit without a full
   *  map-switch round trip. `undefined` until the first server round trip
   *  (paint or event) that returns one, or until seeded via `initialMap`
   *  below -- MapCanvas falls back to its own `data.map` (useMapLayout)
   *  whenever this is undefined, exactly like the blocks/staticBlocks
   *  fallback it already has. */
  map: MapData | undefined;
  isDirty: boolean;
  /** Task 13: whether the server's own undo/redo stack has anything to act
   *  on -- see EditCommandStack.canUndo()/canRedo() (core) and sendSession
   *  (server), which is the one place that actually knows the stack depth.
   *  Both default false while no session is open (mapName === null) or
   *  before the first server round trip has told us otherwise. */
  canUndo: boolean;
  canRedo: boolean;
  beginStroke(): Promise<void>;
  applyPaint(body: PaintApplyBody): Promise<void>;
  endStroke(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Task 13, found live (not in the plan's own text -- see this task's own
   *  report): SaveDialog's own commit call is a plain `fetch` straight to
   *  `POST /api/edit/:map/commit`, not routed through this hook at all (it
   *  only needs `mapName`, not the rest of this hook's surface) -- and a
   *  successful commit makes the server CLOSE that session (editSessions.ts
   *  -- `close`, not `markSaved()`-and-keep-open, per that route's own doc
   *  comment). Nothing tells this hook's local isDirty/canUndo/canRedo
   *  that happened, so without this, the Toolbar's dirty dot and disabled
   *  Save button would stay stuck on after a real save until the player
   *  switched maps and back. The caller (App.tsx's own onCommitted) is
   *  responsible for calling this the instant SaveDialog reports success.
   *  `blocks` deliberately isn't touched -- the just-committed blocks ARE
   *  now what's on disk, so they stay exactly as they are. */
  markClean(): void;
  /** Task 14: thin client faces for the `/event/move|add|delete` routes
   *  (Task 9) -- mirror undo/redo's own `Promise<void>` shape (the caller
   *  reads updated state off this hook's own return value afterward, not
   *  off a resolved value) rather than each inventing its own return type.
   *  `value` for addEvent is a RAW object literal (snake_case field names)
   *  -- see events.ts's own `addEvent` doc comment, it is spliced verbatim
   *  into map.json server-side, so it must match the file's own field
   *  names, never MapData's camelCase ones. */
  moveEvent(kind: EventKind, index: number, x: number, y: number): Promise<void>;
  addEvent(kind: EventKind, value: Record<string, unknown>): Promise<void>;
  /** Resolves to `/event/delete`'s own `warpRenumberWarnings` (empty for a
   *  non-warp delete, or when nothing open) -- Task 7/9's purpose-built
   *  cross-map footgun warning: deleting warp N on this map silently
   *  renumbers every later warp on the SAME map, and any OTHER map's warp
   *  whose destWarpId pointed at N now targets whatever shifted into its
   *  place (see events.ts's own findWarpsTargetingByIndex doc comment).
   *  The caller (App.tsx) is responsible for actually surfacing these --
   *  this hook only threads them through, it doesn't decide how. */
  deleteEvent(kind: EventKind, index: number): Promise<WarpRenumberWarning[]>;
  /** Task 17: `POST /api/edit/:map/sign/add` (SignComposer) has the exact
   *  same `{ map, isDirty }` response shape as the `/event/*` routes
   *  (EventOpResponse above) -- it's built by the same `handleEventOp`
   *  helper server-side -- but SignComposer calls it directly via `fetch`
   *  (it also needs `scriptLabel`, which isn't part of this hook's own
   *  surface, and its own onAdded callback is specified to carry only that
   *  string, not the whole response). Without this, editSession's local
   *  `map`/`isDirty`/`canUndo` would go stale the instant a sign was added
   *  -- MapCanvas's event markers and the Toolbar's dirty dot would not
   *  reflect the new object event until some OTHER edit op (a paint stroke,
   *  a move) happened to sync them. App.tsx's own SignComposer mount calls
   *  this with the same response body SignComposer already parsed, so
   *  there's no second round trip -- just applying data already in hand,
   *  the same tail `callEvent` runs internally for every `/event/*` call. */
  applyExternalMapUpdate(map: MapData, isDirty: boolean): void;
}

interface SessionResponse {
  blocks: Block[];
  border: Block[];
  /** Present on paint begin/apply/end and undo/redo (all route through the
   *  server's own `sendSession` helper, packages/server/src/index.ts) --
   *  `null` on undo/redo's own "nothing open" no-op response, absent from
   *  nothing else that reaches `applyResponse`. */
  map?: MapData | null;
  isDirty: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

/** The `/event/move|add|delete` routes' own response shape -- deliberately
 *  narrower than SessionResponse above: unlike every OTHER mutating route,
 *  these three build `{ map, isDirty }` by hand instead of routing through
 *  the server's own `sendSession` helper (which is what supplies
 *  blocks/border/canUndo/canRedo everywhere else) -- unfortunate, since
 *  that helper's own doc comment on the server claims otherwise ("every
 *  route that touches the stack ... reports it for free through this one
 *  shared response shape"), but a real, pre-existing gap in Task 9's own
 *  routes, not something this task's file list (no server/src/index.ts
 *  change listed) is in scope to fix. See `callEvent` below for how this
 *  hook compensates for the missing canUndo/canRedo without a server round
 *  trip that doesn't exist. */
interface EventOpResponse {
  map: MapData;
  isDirty: boolean;
  /** Only ever present on `/event/delete`'s own response, and only for a
   *  warp delete -- see `deleteEvent`'s own doc comment above. */
  warpRenumberWarnings?: WarpRenumberWarning[];
}

/**
 * The client-side face of Task 8/9's `/api/edit/:map/*` routes -- mirrors
 * every other data hook's own "fetch, hold in state, expose setters that
 * round-trip and update from the response" shape (useDungeons.ts is the
 * closest sibling). `blocks`/`border`/`isDirty`/`canUndo`/`canRedo` all come
 * straight from whatever the server's own session state was after the last
 * call; this hook never computes anything client-side, it is a thin, honest
 * mirror.
 *
 * `mapName: string | null` mirrors useMapLayout's own null-tolerant contract
 * (see that hook's doc comment) -- Task 13 is the first caller that needs to
 * invoke this hook unconditionally from App.tsx (Map mode may have nothing
 * selected, or may be showing a read-only view with editing not yet
 * relevant), and every React hook must be called on every render regardless.
 * With `mapName === null`, every mutating call below is a no-op that never
 * touches the network -- there is nothing open on the server to talk to.
 *
 * `initialBlocks` (Task 13): there is deliberately no server route that
 * returns a freshly-opened session's blocks on their own (only the
 * paint/undo/redo routes return a session snapshot, since those are the only
 * routes Task 8/9 needed) -- so without a seed, `blocks` would start `[]`
 * and MapCanvas's overlay compositing (which switches to `editSession.blocks`
 * the instant the prop is non-null, see MapCanvas.tsx's own `blocks` doc
 * comment) would render every overlay as empty until the player's first
 * edit. Passing the map's already-fetched static blocks (`useMapLayout`'s
 * own `data.blocks`) here seeds the first paint with real data instead.
 *
 * `initialMap` (Task 14): the exact same seeding problem as `initialBlocks`
 * above, one level up -- no route returns a freshly-opened session's `map`
 * on its own either, so without a seed MapCanvas's event markers would
 * render from `undefined` (falling back to `data.map`, harmlessly, per that
 * component's own doc comment) right up until the first paint or event op.
 * Passing `useMapLayout`'s own already-fetched `data.map` here means the
 * live/static switch in MapCanvas is invisible to the player from the very
 * first render, not just after their first edit.
 */
export function useEditSession(mapName: string | null, initialBlocks?: Block[], initialMap?: MapData): UseEditSessionResult {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks ?? []);
  const [border, setBorder] = useState<Block[]>([]);
  const [map, setMap] = useState<MapData | undefined>(initialMap);
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Reset to the new map's own seed whenever `mapName` OR `initialBlocks`
  // changes -- otherwise a session opened for map A would leak its blocks/
  // dirty/undo state into map B's view the instant `selected` changes, the
  // same class of bug App.tsx's own WorldCanvas `key` fix (Task 15) guards
  // against for a different component.
  //
  // Depending on `initialBlocks` too (not just `mapName`) matters because of
  // an ordering gotcha between this hook and useMapLayout, its usual source
  // for the seed: when `selected` changes, useMapLayout's own `data` does
  // NOT reset synchronously -- it keeps the PREVIOUS map's blocks until its
  // fetch resolves (see that hook's own effect: it only guards `!name`, it
  // never resets `data` on a plain name change). If this effect only ran on
  // `mapName`, the very first reset after a map switch would seed from the
  // OLD map's blocks. Re-running when `initialBlocks`'s reference changes
  // means a second, corrective reset lands once useMapLayout's fetch
  // actually resolves for the NEW map -- and since App.tsx only mounts
  // MapCanvas once `layout.data` is truthy for the current map (nothing can
  // paint before then), that second reset always lands before the player
  // could possibly have started editing, so it never clobbers real work.
  useEffect(() => {
    setBlocks(initialBlocks ?? []);
    setBorder([]);
    setMap(initialMap);
    setIsDirty(false);
    setCanUndo(false);
    setCanRedo(false);
  }, [mapName, initialBlocks, initialMap]);

  const applyResponse = (d: SessionResponse) => {
    setBlocks(d.blocks);
    setBorder(d.border);
    if (d.map !== undefined) setMap(d.map ?? undefined);
    setIsDirty(d.isDirty);
    setCanUndo(d.canUndo ?? false);
    setCanRedo(d.canRedo ?? false);
  };

  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      if (!mapName) return; // nothing open -- see this hook's own doc comment
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
      applyResponse((await r.json()) as SessionResponse);
    },
    [mapName],
  );

  const beginStroke = useCallback(() => call("/paint/begin"), [call]);
  const applyPaint = useCallback((body: PaintApplyBody) => call("/paint/apply", body), [call]);
  const endStroke = useCallback(() => call("/paint/end"), [call]);
  const undo = useCallback(() => call("/undo"), [call]);
  const redo = useCallback(() => call("/redo"), [call]);

  const markClean = useCallback(() => {
    setIsDirty(false);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  // Task 14: the three `/event/*` routes get their OWN call path, not
  // `call` above -- their response is `{ map, isDirty }` only (see
  // EventOpResponse's own doc comment), never blocks/border/canUndo/
  // canRedo, so routing them through `applyResponse` (which expects the
  // full SessionResponse shape) would stomp `blocks` to `undefined` the
  // instant a player moved an event. `blocks`/`border` are left
  // deliberately untouched here -- event ops never mutate them server-side
  // either (handleEventOp only ever reassigns `entry.session.map`).
  const callEvent = useCallback(
    async (path: string, body: unknown): Promise<WarpRenumberWarning[]> => {
      if (!mapName) return []; // nothing open -- see this hook's own doc comment
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
      const d = (await r.json()) as EventOpResponse;
      setMap(d.map);
      setIsDirty(d.isDirty);
      // canUndo/canRedo aren't in this route's response (EventOpResponse's
      // own doc comment above explains why) -- but handleEventOp
      // (packages/server/src/index.ts) unconditionally calls
      // `entry.stack.push(...)` for every one of these three ops before
      // responding, and EditCommandStack.push (packages/core/src/edit/
      // commands.ts) is unconditional too: it always appends to undoStack
      // and always resets redoStack to []. So canUndo=true/canRedo=false
      // is exactly what the server-side stack now holds after ANY
      // successful move/add/delete, deterministically -- setting it here
      // keeps the Toolbar's Undo/Redo buttons honest without a round trip
      // the route doesn't currently provide.
      setCanUndo(true);
      setCanRedo(false);
      return d.warpRenumberWarnings ?? [];
    },
    [mapName],
  );

  // moveEvent/addEvent stay Promise<void> -- their own routes never carry
  // warpRenumberWarnings (only /event/delete does), so callEvent's return
  // value is meaningless to them; discarded via `.then(() => {})` rather
  // than widening their own public signature to something callers would
  // have to needlessly check.
  const moveEvent = useCallback((kind: EventKind, index: number, x: number, y: number) => callEvent("/event/move", { kind, index, x, y }).then(() => {}), [callEvent]);
  const addEvent = useCallback((kind: EventKind, value: Record<string, unknown>) => callEvent("/event/add", { kind, value }).then(() => {}), [callEvent]);
  const deleteEvent = useCallback((kind: EventKind, index: number) => callEvent("/event/delete", { kind, index }), [callEvent]);

  // Same tail as callEvent above (setMap/setIsDirty/canUndo=true/
  // canRedo=false) -- see this method's own doc comment on
  // UseEditSessionResult for why SignComposer's already-fetched response
  // lands here instead of a fourth call path duplicating `call`/`callEvent`.
  const applyExternalMapUpdate = useCallback((nextMap: MapData, nextIsDirty: boolean) => {
    setMap(nextMap);
    setIsDirty(nextIsDirty);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  return { blocks, border, map, isDirty, canUndo, canRedo, beginStroke, applyPaint, endStroke, undo, redo, markClean, moveEvent, addEvent, deleteEvent, applyExternalMapUpdate };
}
