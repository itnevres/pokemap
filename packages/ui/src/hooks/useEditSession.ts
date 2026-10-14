import { useCallback, useMemo } from "react";
import { useEditSessionCore } from "../shared/useEditSessionCore.js";
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
   *  names, never MapData's camelCase ones.
   *
   *  Follow-up: `moveEvent`'s `elevation` is optional and, when passed, is
   *  now genuinely persisted (core's `moveEvent`, Task 7, gained an
   *  optional elevation param) -- a canvas drag omits it (no elevation
   *  concept there), EventInspector's commit sends it. `JSON.stringify`
   *  drops an `undefined` property, so an omitted elevation sends a body
   *  with no `elevation` key at all, matching the server's own
   *  optional-field handling. */
  moveEvent(kind: EventKind, index: number, x: number, y: number, elevation?: number): Promise<void>;
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
  /** Plan 2 follow-up 5: `POST /api/edit/:map/discard` (editSessions.ts's
   *  own `close()`) -- "give up on this whole session, revert to disk
   *  state," a separate, explicit Toolbar action, not a repurposed
   *  SaveDialog Cancel (that button deliberately stays non-destructive, see
   *  its own comment).
   *
   *  Deliberately uses the core discard path instead of merging a session
   *  reply as the other mutating methods do. The discard route's own
   *  response is the exact same "nothing open" shape undo/redo already
   *  return on a closed session (`blocks: []`, `map: null`) -- and
   *  MapCanvas.tsx's own `blocks` local is `editSession ? editSession.blocks
   *  : staticBlocks`. App.tsx ALWAYS passes a real (non-undefined)
   *  `editSession` object as a prop, so that ternary ALWAYS takes the
   *  `editSession.blocks` branch, even for an empty array. Routing a
   *  discard through the session reply merge would set `blocks` to `[]`
   *  and the canvas would go instantly blank -- and STAY blank, since
   *  the map and seed identities do not change on discard, so the core
   *  would continue to show that empty live state.
   *
   *  Instead, once the server confirms the session is closed, this resets
   *  local state to the core's pre-edit seed
   *  (`initialBlocks`/`initialMap`) -- what the map looked like BEFORE
   *  any edits, i.e. real disk state, not an empty grid. A future
   *  "simplification" back to `call()` would silently reintroduce exactly
   *  that blank-canvas regression.
   *
   *  Throws on a non-ok response rather than resetting local state anyway:
   *  a discard that LOOKS like it worked but didn't actually close the
   *  server-side session would desync client/server state (the player sees
   *  a reverted canvas while the server still thinks the map is dirty), so
   *  the failure must surface to the caller instead of being swallowed.
   */
  discard(): Promise<void>;
}

interface SessionResponse {
  blocks: Block[];
  border: Block[];
  /** Present on paint begin/apply/end and undo/redo (all route through the
   *  server's own `sendSession` helper, packages/server/src/index.ts) --
   *  `null` on undo/redo's own "nothing open" no-op response, absent from
   *  nothing else that reaches the core session reply merge. */
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
  const seed = useMemo(() => ({ blocks: initialBlocks ?? [], border: [] as Block[], map: initialMap }), [initialBlocks, initialMap]);
  const { state, isDirty, canUndo, canRedo, post, apply, discard, markClean } = useEditSessionCore("/api/edit", mapName, seed);
  const { blocks, border, map } = state;

  // The core derives the live view from map/seed identity and guards every reply with its issue ticket.
  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      const reply = await post<SessionResponse>(path, body);
      if (!reply) return;
      const d = reply.data;
      apply({
        state: (prev) => ({ blocks: d.blocks, border: d.border, map: d.map === undefined ? prev.map : d.map ?? undefined }),
        isDirty: d.isDirty, canUndo: d.canUndo ?? false, canRedo: d.canRedo ?? false,
      }, reply.ticket);
    },
    [post, apply],
  );

  const beginStroke = useCallback(() => call("/paint/begin"), [call]);
  const applyPaint = useCallback((body: PaintApplyBody) => call("/paint/apply", body), [call]);
  const endStroke = useCallback(() => call("/paint/end"), [call]);
  const undo = useCallback(() => call("/undo"), [call]);
  const redo = useCallback(() => call("/redo"), [call]);

  // Event replies omit blocks/border and stack flags. Merge only the map through the core;
  // every successful event op pushes an undo entry and clears redo on the server.
  const callEvent = useCallback(
    async (path: string, body: unknown): Promise<WarpRenumberWarning[]> => {
      const reply = await post<EventOpResponse>(path, body);
      if (!reply) return [];
      const d = reply.data;
      apply({ state: (prev) => ({ ...prev, map: d.map }), isDirty: d.isDirty, canUndo: true, canRedo: false }, reply.ticket);
      return d.warpRenumberWarnings ?? [];
    },
    [post, apply],
  );

  // moveEvent/addEvent stay Promise<void> -- their own routes never carry
  // warpRenumberWarnings (only /event/delete does), so callEvent's return
  // value is meaningless to them; discarded via `.then(() => {})` rather
  // than widening their own public signature to something callers would
  // have to needlessly check.
  const moveEvent = useCallback(
    (kind: EventKind, index: number, x: number, y: number, elevation?: number) =>
      callEvent("/event/move", { kind, index, x, y, elevation }).then(() => {}),
    [callEvent],
  );
  const addEvent = useCallback((kind: EventKind, value: Record<string, unknown>) => callEvent("/event/add", { kind, value }).then(() => {}), [callEvent]);
  const deleteEvent = useCallback((kind: EventKind, index: number) => callEvent("/event/delete", { kind, index }), [callEvent]);

  // SignComposer supplies an already-parsed map; the core applies it to the current map/seed.
  const applyExternalMapUpdate = useCallback((nextMap: MapData, nextIsDirty: boolean) => {
    apply({ state: (prev) => ({ ...prev, map: nextMap }), isDirty: nextIsDirty, canUndo: true, canRedo: false });
  }, [apply]);

  return { blocks, border, map, isDirty, canUndo, canRedo, beginStroke, applyPaint, endStroke, undo, redo, markClean, moveEvent, addEvent, deleteEvent, applyExternalMapUpdate, discard };
}
