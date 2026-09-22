import { useEffect, useMemo, useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas, type EventRef } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { DungeonSidebar } from "./components/DungeonSidebar.js";
import { Toolbar, type ToolKind } from "./components/Toolbar.js";
import { SaveDialog } from "./components/SaveDialog.js";
import { SignComposer } from "./components/SignComposer.js";
import { CollisionPalette, type CollisionElevation } from "./components/CollisionPalette.js";
import { MetatilePalette } from "./components/MetatilePalette.js";
import { EventInspector, type SelectedEvent } from "./components/EventInspector.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";
import { useDungeons } from "./hooks/useDungeons.js";
import { useEditSession } from "./hooks/useEditSession.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { EventKind } from "@pokemap/core/src/edit/events.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";

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

type Mode = "map" | "world" | "dungeon";

export function App() {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  const [openDungeonId, setOpenDungeonId] = useState<string | null>(null);

  const { data, error } = useMapGroups();
  const layout = useMapLayout(selected);
  // Known limitation, accepted for now (predates this task): this is a
  // snapshot taken once per World-mode entry, not a live subscription -- it
  // can go stale within the session after a drag or a jump-reveal on
  // WorldCanvas's own canvas. A full refresh currently requires leaving and
  // re-entering World mode.
  const { placed: worldVisibility, error: worldVisibilityError } = useWorldVisibility(mode === "world");
  const dungeons = useDungeons(mode === "dungeon");

  // Task 13: the edit session for whatever map is `selected`, tracked
  // unconditionally on `selected` -- NOT gated on `mode === "map"`, deliberately
  // mirroring `layout` just above. Gating this on mode would mean switching to
  // World/Dungeon mode and back resets this hook's own `[mapName, ...]` effect
  // (mapName briefly going to `null` and back), wiping the client's view of
  // isDirty/blocks/undo-redo even though the REAL session sitting in server
  // memory (Task 8/9's EditSession, keyed only by map name) is untouched --
  // the client would silently desync from what the server still thinks is
  // dirty. Tracking `selected` directly keeps the two in agreement regardless
  // of which top-level view happens to be on screen, and per I6 it's also
  // exactly the value we want available everywhere the "you have unsaved
  // changes" guards below need it, not just while Map mode's own UI is
  // rendered.
  const editSession = useEditSession(selected, layout.data?.blocks, layout.data?.map);

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
  const currentMap = editSession.map ?? layout.data?.map;

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

  // EventInspector's own X/Y/Elevation fields -- elevation rides along for
  // symmetry with x/y (EventInspector.tsx's own doc comment), but core's
  // moveEvent (Task 7, packages/core/src/edit/events.ts) only ever writes
  // x/y to disk; there is no persisted way to move an event's elevation
  // today, and extending that primitive is out of this task's scope (the
  // file list above never lists core/src/edit/events.ts or the server
  // routes as something Task 14 touches). x/y are sent to the real route;
  // elevation is merged into LOCAL selection state only, so the field
  // doesn't visibly snap back to its old value the instant you type -- an
  // honest gap, not a silent no-op: flagged prominently in this task's own
  // report, and a reload or map switch will NOT keep a changed elevation,
  // only x/y will.
  const onMoveEventFromInspector = (next: { kind: EventKind; index: number; x: number; y: number; elevation: number }) => {
    editSession
      .moveEvent(next.kind, next.index, next.x, next.y)
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
    if (!currentMap || !layout.data) return Promise.resolve();
    const newIndex = currentMap.objectEvents.length;
    const x = Math.floor(layout.data.layout.width / 2);
    const y = Math.floor(layout.data.layout.height / 2);
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
  // switch (only on a map switch -- see selectMap below): this is intended
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
  //   - "dropper"/"shift" have no MapCanvas-side behaviour wired at all
  //     (still a follow-up, out of this task's scope) -- also inert.
  const activeTool = useMemo(() => {
    if (activeToolKind === "collision") return { kind: "collision" as const, value: collisionValue };
    if ((activeToolKind === "pencil" || activeToolKind === "rect" || activeToolKind === "bucket") && currentStamp) {
      return { kind: activeToolKind, stamp: currentStamp };
    }
    return null;
  }, [activeToolKind, collisionValue, currentStamp]);

  // I6: "no autosave, ever" also means losing a dirty session silently must
  // never happen -- closing the tab is the browser-level case (this effect),
  // switching maps is the in-app case (selectMap's own guard just below).
  // Gated on isDirty, not just "an edit session exists": an OPEN session
  // that matches disk (nothing painted yet, or already saved) is not lossy
  // to abandon, and a handler that's always attached would make Step 13's
  // own teeth-proof test meaningful (attaching unconditionally is exactly
  // the bug that test exists to catch).
  useEffect(() => {
    if (!editSession.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editSession.isDirty]);

  const selectMap = (name: string) => {
    if (editSession.isDirty && !window.confirm("You have unsaved changes on this map. Discard them and switch maps?")) {
      return;
    }
    setSelected(name);
    setSelectVersion((v) => v + 1);
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

  // `.find()` over `dungeons.data` returns the SAME element reference every
  // render as long as the array itself hasn't been replaced (only true
  // after a real create/rename/setMaps/remove -- see useDungeons's own
  // `gen`-driven refetch) -- so `openDungeon`'s identity is stable across
  // unrelated App re-renders, which is what lets the mapFilter memo below
  // (and, inside WorldCanvas, its own mapFilter-keyed auto-fit effect) fire
  // once per dungeon opened, switched, OR mutated -- including a pure
  // rename, which re-mints the array reference (and therefore `openDungeon`
  // and `mapFilter` too) and so refits the canvas as well, resetting the
  // user's pan/zoom mid-edit even though only the dungeon's name changed.
  // Intentional (matches "opened/switched/edited"), just worth knowing
  // before assuming a rename is a no-op here.
  const openDungeon = mode === "dungeon" ? (dungeons.data?.find((d) => d.id === openDungeonId) ?? null) : null;
  const mapFilter = useMemo(() => (openDungeon ? new Set(openDungeon.maps) : null), [openDungeon]);

  const allMapNames = useMemo(
    () => (data ? data.groupOrder.flatMap((g) => data.groups[g] ?? []) : []),
    [data],
  );

  // Review fix: the plan's own draft inline arrow (`(id) => { dungeons.remove(id); if (...) setOpenDungeonId(null); }`)
  // discarded the Promise remove() returns and cleared openDungeonId
  // unconditionally, even on a rejected delete (e.g. a 404 if the dungeon
  // was already gone, or a network failure) -- that would desync the UI
  // (sidebar still lists the dungeon, but the canvas already fell back to
  // the placeholder) and the rejection would be an uncaught promise
  // rejection with zero user feedback. This awaits it explicitly and only
  // clears openDungeonId -- and thus mapFilter, via openDungeon above --
  // once the delete has actually succeeded, and rethrows on failure so
  // DungeonSidebar's own deleteDungeon (which awaits onDelete and reports
  // into its existing actionError slot) surfaces the rejection instead of
  // wrongly clearing its error state as if the delete had gone through.
  const handleDeleteDungeon = async (id: string) => {
    await dungeons.remove(id);
    // Functional form, not `if (openDungeonId === id) setOpenDungeonId(null)`:
    // this runs after an `await`, so the plain closed-over `openDungeonId`
    // could be stale by the time the DELETE resolves -- e.g. open dungeon A,
    // click Delete, then (before the request resolves) switch to open
    // dungeon B instead. The stale comparison would still see "A" === "A"
    // from when this function was called and incorrectly clear
    // openDungeonId, closing dungeon B even though B was never deleted.
    // Comparing against the CURRENT state at the moment the setter actually
    // runs closes that race.
    setOpenDungeonId((cur) => (cur === id ? null : cur));
  };

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        <div className="app__mode" role="group" aria-label="View">
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "map"}
            onClick={() => setMode("map")}
          >
            Map
          </button>
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "world"}
            onClick={() => setMode("world")}
          >
            World
          </button>
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "dungeon"}
            onClick={() => setMode("dungeon")}
          >
            Dungeon
          </button>
        </div>
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {/* Review fix: this used to live only inside the non-dungeon
              branch below, so a failed /api/groups fetch was invisible in
              Dungeon mode -- yet DungeonSidebar's add-map input hard-
              requires allMapNames.includes(...), so allMapNames silently
              degrading to [] on that same failure turned every add-map
              attempt into a silent no-op with zero explanation. Hoisted
              here so the error is surfaced regardless of which mode is
              active; the ternary below still renders it (and only it, as
              before) for Map/World mode via its own `error ? null` branch,
              so that behaviour is unchanged. */}
          {error && <p className="map-tree__empty">Could not load map groups: {error}</p>}
          {mode === "dungeon" ? (
            <DungeonSidebar
              dungeons={dungeons.data}
              error={dungeons.error}
              openId={openDungeonId}
              onOpen={setOpenDungeonId}
              onCreate={dungeons.create}
              onRename={dungeons.rename}
              onSetMaps={dungeons.setMaps}
              onDelete={handleDeleteDungeon}
              allMapNames={allMapNames}
            />
          ) : error ? null : data ? (
            <>
              {mode === "world" && worldVisibilityError ? (
                <p className="map-tree__empty">Could not load world visibility: {worldVisibilityError}</p>
              ) : null}
              <MapTree
                data={data}
                selected={selected}
                onSelect={selectMap}
                worldMode={mode === "world"}
                visibility={worldVisibility}
              />
            </>
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            // key="world"/"dungeon": without distinct keys, switching FROM
            // Dungeon mode TO World mode reconciles as a prop update on the
            // SAME WorldCanvas instance (both branches render the same
            // element type in the same position, and openDungeon goes null
            // in the same commit `mode` flips) -- leaking pan/zoom,
            // selected, revealedMaps, linesOn, warpsOn, lens,
            // spotlightHits, and warpPopup across the mode boundary instead
            // of starting fresh. Distinct keys force React to always treat
            // a mode switch as a brand-new mount.
            <WorldCanvas key="world" jumpToMap={selected} jumpToken={selectVersion} />
          ) : mode === "dungeon" ? (
            openDungeon ? (
              <WorldCanvas key="dungeon" mapFilter={mapFilter} />
            ) : (
              <p className="app__canvas-placeholder">Select or create a dungeon</p>
            )
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : layout.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {layout.error}</p>
          ) : layout.data ? (
            <div className="app__map-editing">
              <Toolbar
                activeToolKind={activeToolKind}
                onSelectTool={setActiveToolKind}
                isDirty={editSession.isDirty}
                onUndo={() => void editSession.undo()}
                onRedo={() => void editSession.redo()}
                canUndo={editSession.canUndo}
                canRedo={editSession.canRedo}
                onOpenSave={() => setSaveDialogOpen(true)}
                onOpenSignComposer={() => setSignComposerOpen(true)}
                // Code-review fix: only tools actually wired to MapCanvas
                // may render enabled (see `activeTool`'s own doc comment
                // above) -- everything else must render visibly disabled,
                // not clickable-but-silently-inert. dropper/shift stay out
                // of this list -- a separate, not-yet-done follow-up.
                availableTools={["collision", "pencil", "rect", "bucket"]}
              />
              {activeToolKind === "collision" && (
                <div className="app__collision-strip">
                  <CollisionPalette selected={collisionValue} onSelect={setCollisionValue} />
                </div>
              )}
              {(activeToolKind === "pencil" || activeToolKind === "rect" || activeToolKind === "bucket") && (
                <div className="app__metatile-strip">
                  <MetatilePalette
                    layoutName={layout.data.layout.name}
                    split={layout.data.split}
                    primaryCount={layout.data.primaryCount}
                    secondaryCount={layout.data.secondaryCount}
                    onSelect={setCurrentStamp}
                  />
                </div>
              )}
              {/* Review fix: a failed move/add/delete used to be an
                  unhandled rejection with zero visible signal -- reuses
                  SaveDialog's own `.save-dialog__refusal`-style danger
                  banner (role="alert", border-danger) rather than inventing
                  a second error-surface convention. Dismissible so it
                  doesn't linger forever after the player has seen it; also
                  cleared automatically on the next successful event op. */}
              {eventOpError && (
                <div className="app__event-op-error" role="alert">
                  <span>{eventOpError}</span>
                  <button type="button" className="app__event-op-error-dismiss" onClick={() => setEventOpError(null)} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              )}
              {/* Task 17: one-shot confirmation after a successful sign add
                  -- same dismissible-banner shape as eventOpError just
                  above, accent-toned (not danger) since this reports a
                  success, not a failure. role="status" (not "alert"): this
                  is informational, not urgent, matching the semantic
                  distinction between the two ARIA live-region roles. */}
              {signAddedMessage && (
                <div className="app__sign-added" role="status">
                  <span>{signAddedMessage}</span>
                  <button type="button" className="app__sign-added-dismiss" onClick={() => setSignAddedMessage(null)} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              )}
              {/* Task 14: EventInspector docks as a real side panel next to
                  the canvas (DESIGN.md's own layout section anticipates
                  exactly this -- "whatever Task 21+ adds -- an inspector, a
                  metatile palette"), not another horizontal strip like
                  CollisionPalette above it -- its X/Y/Elevation/Delete form
                  reads naturally as a vertical column, the same shape
                  app__sidebar's own MapTree already uses on the opposite
                  edge of the screen. Always mounted (not gated on a
                  selection): EventInspector's own empty state carries the
                  Add Event entry point. */}
              <div className="app__map-editing-body">
                <MapCanvas
                  mapName={selected}
                  data={layout.data}
                  editSession={editSession}
                  activeTool={activeTool}
                  onSelectEvent={onSelectEvent}
                  selectedEventRef={selectedEvent ? { kind: selectedEvent.kind, index: selectedEvent.index } : null}
                  onMoveEvent={onCanvasMoveEvent}
                />
                <EventInspector selected={selectedEvent} onMove={onMoveEventFromInspector} onDelete={onDeleteEvent} onAdd={onAddEvent} />
              </div>
            </div>
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
          {/* Task 13: SaveDialog owns its own modal shell (backdrop, Escape-
              to-cancel, autofocus -- mirrors WarpDestinationModal's own
              established pattern exactly, see that component's own "Review
              fix" comment). Rendered as a sibling of the branches above, at
              this level, for the same stacking-context reason
              WarpDestinationModal documents on its own backdrop: a modal
              nested inside a lower box could never paint above its
              siblings regardless of z-index. */}
          {saveDialogOpen && selected && (
            <SaveDialog
              mapName={selected}
              // markClean() first: found live (see useEditSession.ts's own
              // doc comment on markClean) -- SaveDialog's commit call
              // bypasses this hook entirely, so without this the Toolbar's
              // dirty dot would stay on after a real, successful save.
              onCommitted={() => {
                editSession.markClean();
                setSaveDialogOpen(false);
              }}
              onCancel={() => setSaveDialogOpen(false)}
            />
          )}
          {/* Task 17: SignComposer owns its own modal shell exactly like
              SaveDialog above (Step 10's own design correction) -- App.tsx
              just conditionally renders it as a sibling, same stacking-
              context reasoning as SaveDialog's own comment just above. */}
          {signComposerOpen && selected && (
            <SignComposer
              mapName={selected}
              onSessionUpdated={(map, isDirty) => editSession.applyExternalMapUpdate(map, isDirty)}
              onAdded={(scriptLabel) => {
                setSignComposerOpen(false);
                setSignAddedMessage(`Added wild sign: ${scriptLabel}`);
              }}
              onCancel={() => setSignComposerOpen(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
