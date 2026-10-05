import { useMemo, useState } from "react";
import type { EventRef } from "../components/MapCanvas.js";
import type { ToolKind } from "../components/Toolbar.js";
import type { CollisionElevation } from "../components/CollisionPalette.js";
import type { SelectedEvent } from "../components/EventInspector.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { EventKind } from "@pokemap/core/src/edit/events.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";
import type { UseEditSessionResult } from "./useEditSession.js";
import type { MapLayoutData } from "./useMapLayout.js";

/** Task 14: resolves a bare {kind,index} ref (MapCanvas's own selection
 *  unit) into EventInspector's richer `SelectedEvent`, by looking the event
 *  up in whichever `MapData` is currently live -- the caller always passes
 *  `editSession.map ?? layout.data?.map`, the same live/static precedence
 *  MapCanvas.tsx's own `map` local uses internally. Spreads the raw event
 *  FIRST, kind/index override second: coord/bg events are open-ended
 *  (`[k: string]: unknown`, see EventInspector.tsx's own SelectedEvent doc
 *  comment) and there is no guarantee a raw field named `kind` or `index`
 *  never collides with these two synthetic ones otherwise. */
function resolveEventRef(ref: EventRef | null, map: MapData | undefined): SelectedEvent | null {
  if (!ref || !map) return null;
  if (ref.kind === "object") {
    const e = map.objectEvents[ref.index];
    return e ? { kind: "object", index: ref.index, x: e.x, y: e.y, elevation: e.elevation, graphicsId: e.graphicsId, movementType: e.movementType } : null;
  }
  if (ref.kind === "warp") {
    const e = map.warpEvents[ref.index];
    return e ? { kind: "warp", index: ref.index, x: e.x, y: e.y, elevation: e.elevation, destMap: e.destMap, destWarpId: e.destWarpId } : null;
  }
  if (ref.kind === "coord") {
    const e = map.coordEvents[ref.index];
    return e ? { ...e, kind: "coord", index: ref.index } : null;
  }
  const e = map.bgEvents[ref.index];
  return e ? { ...e, kind: "bg", index: ref.index } : null;
}

/** Review fix: every one of the four editSession.{move,add,delete}Event
 *  call sites below used to fire-and-forget (`void editSession.foo(...)`)
 *  with no `.catch` at all -- unlike every paint call site in
 *  MapCanvas.tsx (`.catch(() => {})` throughout, see that file's own
 *  `endActiveStroke`) and unlike SaveDialog.tsx's own error handling. A
 *  failed move/add/delete (stale index after a race, a 500, a network
 *  blip) was an unhandled promise rejection: the UI kept whatever
 *  optimistic local state it had already set, nothing was actually
 *  persisted, and nothing told the player. Turns whatever `fetch` threw
 *  (see useEditSession.ts's own `callEvent`) into one short, readable
 *  line for the banner below. */
function eventOpErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to update event.";
}

export interface UseMapEditingArgs {
  editSession: UseEditSessionResult;
  /** `layout.data` from `useMapLayout(selected)` -- `null`/`undefined` until loaded. */
  layoutData: MapLayoutData | null | undefined;
}

/** Plan 6c E2: the map-editing state and handlers `App` used to hold inline,
 *  extracted verbatim so a second host (E4's world-view editing chrome) can
 *  mount `MapEditingWorkspace` over the same state. `useEditSession` itself
 *  deliberately stays in `App` (it must track `selected` regardless of mode --
 *  see the comment above its call site), so it is passed in. `App` calls this
 *  once, in the same place the state used to live, so its lifetime is
 *  unchanged: it survives mode switches. */
export function useMapEditing({ editSession, layoutData }: UseMapEditingArgs) {
  // Task 14: whichever event (any kind) is currently selected on the
  // canvas, in real component state -- NOT recomputed inline from
  // editSession.map/layout.data on every render, which is what keeps
  // EventInspector's own draft-resync effect from firing on unrelated App
  // re-renders and clobbering an in-progress, not-yet-blurred edit (see
  // that component's own doc comment). `null` means nothing selected --
  // EventInspector's own empty state ("Add Event") then applies.
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  // Review fix: surfaces a failed move/add/delete (see eventOpErrorMessage's
  // own doc comment above) -- cleared on the next successful op, or by the
  // dismiss button on the banner itself (JSX below). Deliberately its own
  // state, not reusing layout.error/dungeons.error/etc.: those are per-hook
  // load errors that persist until the underlying fetch succeeds again,
  // this is a one-shot "your last click didn't take" notice.
  const [eventOpError, setEventOpError] = useState<string | null>(null);
  // Whichever `map` is actually live right now -- same live/static
  // precedence MapCanvas.tsx's own internal `map` local uses (editSession's
  // live copy once an edit session is open, layout.data's static fetch
  // otherwise). Read by every event handler below that needs to resolve a
  // ref or compute a default add-position.
  const currentMap = editSession.map ?? layoutData?.map;

  const onSelectEvent = (ref: EventRef | null) => setSelectedEvent(resolveEventRef(ref, currentMap));

  // Drag-to-move on the canvas -- no elevation involved (MapCanvas's own
  // onMoveEvent only ever reports x/y, see EventRef's own doc comment).
  // Review fix: the local `selectedEvent` update used to run unconditionally
  // regardless of whether the request actually succeeded -- moved inside
  // `.then` so a failed move leaves the inspector showing the event's real,
  // still-server-confirmed position rather than a lie, and `.catch` surfaces
  // the failure instead of an unhandled rejection.
  const onCanvasMoveEvent = (next: { kind: EventKind; index: number; x: number; y: number }) => {
    editSession
      .moveEvent(next.kind, next.index, next.x, next.y)
      .then(() => {
        setEventOpError(null);
        setSelectedEvent((prev) => (prev && prev.kind === next.kind && prev.index === next.index ? { ...prev, x: next.x, y: next.y } : prev));
      })
      .catch((e: unknown) => setEventOpError(eventOpErrorMessage(e)));
  };

  // EventInspector's own X/Y/Elevation fields -- follow-up to Task 14: core's
  // moveEvent (packages/core/src/edit/events.ts) now takes an optional
  // elevation param and, when passed, actually writes it to disk (a real
  // jsonEdit, not just local component state), so x/y and elevation are
  // both genuinely persisted here, sent together whenever EventInspector's
  // own commit() fires. onCanvasMoveEvent above stays x/y-only on purpose
  // -- a canvas drag has no elevation concept.
  const onMoveEventFromInspector = (next: { kind: EventKind; index: number; x: number; y: number; elevation: number }) => {
    editSession
      .moveEvent(next.kind, next.index, next.x, next.y, next.elevation)
      .then(() => {
        setEventOpError(null);
        setSelectedEvent((prev) =>
          prev && prev.kind === next.kind && prev.index === next.index
            ? { ...prev, x: next.x, y: next.y, elevation: next.elevation }
            : prev,
        );
      })
      .catch((e: unknown) => setEventOpError(eventOpErrorMessage(e)));
  };

  // Returns a Promise (never rejects -- the .catch below turns a failure
  // into `eventOpError` and resolves anyway) so EventInspector can track
  // in-flight state locally and disable its Delete button for the
  // duration -- see that component's own doc comment on this prop.
  const onDeleteEvent = (ref: { kind: EventKind; index: number }): Promise<void> => {
    return editSession
      .deleteEvent(ref.kind, ref.index)
      .then((warpRenumberWarnings) => {
        setEventOpError(null);
        setSelectedEvent(null);
        // Task 7/9's own purpose-built cross-map footgun warning (see
        // events.ts's findWarpsTargetingByIndex doc comment) -- deleting a
        // warp silently renumbers every later warp on THIS map, and any
        // OTHER map's warp that pointed at the deleted index now targets
        // whatever shifted into its place. Only ever non-empty for a warp
        // delete (deleteEvent's own doc comment), but the kind check is
        // kept explicit rather than relying on that alone. A plain
        // window.alert, not a custom dialog: this is a one-shot "go fix
        // these" notice, not a recurring piece of UI worth its own
        // component for what this task's own review scoped as a minimal
        // fix.
        if (ref.kind === "warp" && warpRenumberWarnings.length > 0) {
          const lines = warpRenumberWarnings.map((w) => `  ${w.fromMapId}, warp #${w.warpIndex}`).join("\n");
          window.alert(
            `Deleting this warp renumbered the warps after it on this map.\n` +
              `These warps on OTHER maps now point at the wrong one and need fixing:\n${lines}`,
          );
        }
      })
      .catch((e: unknown) => setEventOpError(eventOpErrorMessage(e)));
  };

  // onAdd's exact shape is deliberately underspecified by the plan this
  // task implements -- a reasonable, minimal, well-documented choice made
  // here (see this task's own report): a default OBJECT event (the most
  // common kind, and the only one with sensible placeholder graphics/
  // movement values -- warp/coord/bg all need a real destination/script/
  // trigger a placeholder can't invent), dropped at the current map's own
  // centre (floor(width/2), floor(height/2)) so it always lands somewhere
  // visible and on-map rather than off-canvas at (0,0). `value` is the RAW
  // snake_case object literal addEvent (Task 7) splices verbatim into
  // map.json -- see that function's own doc comment. The new event's index
  // is computed from the CURRENT objectEvents length BEFORE the call
  // (addEvent always appends, per its own doc comment), so the freshly
  // added event can be selected immediately without waiting on -- or
  // re-deriving from -- the server's round trip.
  // Returns a Promise (never rejects, same shape as onDeleteEvent above) so
  // EventInspector can disable Add Event while it's in flight -- review fix:
  // without this, a rapid double-click computed the same stale `newIndex`
  // twice (both read `currentMap.objectEvents.length` before either
  // response had landed), so the second click's own optimistic selection
  // pointed at the wrong event once both round trips resolved.
  const onAddEvent = (): Promise<void> => {
    if (!currentMap || !layoutData) return Promise.resolve();
    const newIndex = currentMap.objectEvents.length;
    const x = Math.floor(layoutData.layout.width / 2);
    const y = Math.floor(layoutData.layout.height / 2);
    const graphicsId = "OBJ_EVENT_GFX_BOY_1";
    const movementType = "MOVEMENT_TYPE_FACE_DOWN";
    const value = {
      graphics_id: graphicsId, x, y, elevation: 0,
      movement_type: movementType, movement_range_x: 1, movement_range_y: 1,
      trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "NULL", flag: "0",
    };
    return editSession
      .addEvent("object", value)
      .then(() => {
        setEventOpError(null);
        setSelectedEvent({ kind: "object", index: newIndex, x, y, elevation: 0, graphicsId, movementType });
      })
      .catch((e: unknown) => setEventOpError(eventOpErrorMessage(e)));
  };

  // Which paint tool the Toolbar has selected, and the small piece of state
  // each tool needs to actually paint something. Task 13 first wired real
  // tool selection into App.tsx (Tasks 11/12 only ever exercised MapCanvas's
  // editSession/activeTool props via a temporary, pre-commit-reverted
  // hardcode); this follow-up task mounts MetatilePalette and supplies
  // currentStamp, so pencil/rect/bucket are now live too (see `activeTool`'s
  // own doc comment below).
  const [activeToolKind, setActiveToolKind] = useState<ToolKind | null>(null);
  const [collisionValue, setCollisionValue] = useState<CollisionElevation>({ collision: 0, elevation: 0 });
  // The metatile selection pencil/rect/bucket paint with -- chosen via
  // MetatilePalette, mounted below while one of those three tools is active.
  // `null` until the player picks a cell (or a rect drag), same
  // null-until-configured posture `activeTool` already gives every tool
  // below it a stamp for.
  //
  // Deliberately SHARED across all three tools, and NOT cleared on a tool
  // switch (only on a map switch -- see resetForMapChange below): this is intended
  // Porymap-parity behaviour, not an oversight. Pick a metatile once, then
  // pencil/rect/bucket-fill with it freely -- e.g. pencil in a small detail,
  // then bucket-fill the surrounding area with that SAME tile, with no
  // re-pick in between. Clearing it on every tool switch would force an
  // annoying re-pick for that normal workflow.
  const [currentStamp, setCurrentStamp] = useState<Stamp | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  // Task 17: SignComposer's own open/close flag, same shape as
  // saveDialogOpen above. signAddedMessage is a one-shot confirmation --
  // this app had no existing "success" notice anywhere to reuse (only
  // eventOpError's danger-bordered banner), so this is a small, deliberate
  // new one: same dismissible-banner shape as eventOpError, accent-toned
  // instead of danger-toned, cleared by its own dismiss button or replaced
  // by the next sign add -- never auto-cleared on map switch, mirroring
  // eventOpError's own (also never auto-cleared) precedent exactly.
  const [signComposerOpen, setSignComposerOpen] = useState(false);
  const [signAddedMessage, setSignAddedMessage] = useState<string | null>(null);

  // Translates the Toolbar's bare ToolKind into the shape MapCanvas's own
  // `activeTool` prop actually expects (see MapCanvas.tsx's own
  // MapCanvasProps doc comment -- its type union has no "dropper"/"shift"
  // member at all).
  //   - "collision" always has a value to paint with (collisionValue starts
  //     at a sane default and CollisionPalette, mounted below while this
  //     tool is active, is the only thing that ever changes it) -- fully
  //     live today.
  //   - "pencil"/"rect"/"bucket" need a Stamp (a metatile selection) --
  //     MetatilePalette is now mounted below (Plan 2 follow-up 1) while one
  //     of these three is active, and `currentStamp` is what it writes to.
  //     Until the player actually picks a cell (or drags a rect), these stay
  //     null-until-configured, same as before: selectable in the Toolbar,
  //     but inert (same as no tool selected) rather than painting a
  //     hardcoded, non-user-chosen stamp -- a surprising, unwanted write,
  //     the opposite of I6's spirit.
  //   - "shift" (whole-grid torus-wrap shift) and "dropper" (read-only
  //     block pick) need no Stamp/value at all, so they resolve
  //     unconditionally, same as "collision".
  const activeTool = useMemo(() => {
    if (activeToolKind === "collision") return { kind: "collision" as const, value: collisionValue };
    if (activeToolKind === "shift") return { kind: "shift" as const };
    if (activeToolKind === "dropper") return { kind: "dropper" as const };
    if ((activeToolKind === "pencil" || activeToolKind === "rect" || activeToolKind === "bucket") && currentStamp) {
      return { kind: activeToolKind, stamp: currentStamp };
    }
    return null;
  }, [activeToolKind, collisionValue, currentStamp]);

  // Plan 2 follow-up 5: "give up on this whole editing session, revert to
  // disk state" -- a separate, explicit action from SaveDialog's Cancel
  // (which deliberately stays non-destructive, see that component's own
  // comment) and from selectMap's own dirty guard just below (that one
  // blocks a map SWITCH; this one discards edits on the CURRENT map without
  // switching anything). Same confirm() tone as selectMap's own guard, for
  // one consistent voice across this app's two "you're about to lose
  // unsaved changes" prompts. Reuses eventOpError's existing banner/
  // eventOpErrorMessage helper to surface a failed discard, rather than
  // inventing a second error-surface convention -- a discard that silently
  // fails would leave the player thinking their edits are gone when the
  // server-side session is actually still open and dirty.
  const handleDiscard = () => {
    if (!window.confirm("Discard all unsaved changes on this map? This cannot be undone.")) return;
    editSession
      .discard()
      .then(() => setEventOpError(null))
      .catch((e: unknown) => setEventOpError(eventOpErrorMessage(e)));
  };

  // The per-map resets `App.changeSelection` runs on a map switch. Deliberately
  // does NOT touch `activeToolKind`/`collisionValue`: the chosen tool persists
  // across map switches.
  const resetForMapChange = () => {
    // Task 14: a selected event belongs to the map it was selected on --
    // without this, switching from map A (something selected) to map B
    // would carry A's {kind,index} ref into EventInspector, which would
    // either show map B's UNRELATED event at that same index, or (once B's
    // own events run out at that index) crash resolveEventRef's own array
    // lookup path into rendering `null` silently at best.
    setSelectedEvent(null);
    // Plan 2 follow-up 1: a stamp chosen against one layout's tileset (a
    // specific metatile id) is meaningless -- and potentially out-of-range
    // -- against a DIFFERENT layout's own tileset. A stale stamp must never
    // survive a map switch; pencil/rect/bucket go back to inert until the
    // player picks a fresh one from the newly mounted MetatilePalette.
    setCurrentStamp(null);
  };

  return {
    selectedEvent,
    eventOpError,
    setEventOpError,
    currentMap,
    onSelectEvent,
    onCanvasMoveEvent,
    onMoveEventFromInspector,
    onDeleteEvent,
    onAddEvent,
    activeToolKind,
    setActiveToolKind,
    collisionValue,
    setCollisionValue,
    currentStamp,
    setCurrentStamp,
    saveDialogOpen,
    setSaveDialogOpen,
    signComposerOpen,
    setSignComposerOpen,
    signAddedMessage,
    setSignAddedMessage,
    activeTool,
    handleDiscard,
    resetForMapChange,
  };
}
