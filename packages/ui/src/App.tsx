import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MapTree } from "./components/MapTree.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { DungeonSidebar } from "./components/DungeonSidebar.js";
import { SaveDialog } from "./components/SaveDialog.js";
import { SignComposer } from "./components/SignComposer.js";
import { MapEditingWorkspace } from "./components/MapEditingWorkspace.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";
import { useDungeons } from "./hooks/useDungeons.js";
import { useEditSession } from "./hooks/useEditSession.js";
import { useMapEditing } from "./hooks/useMapEditing.js";

type Mode = "map" | "world" | "dungeon";

export interface AppProps {
  /** Plan 6c A2: the header's project-switcher button (`ProjectSwitcher`),
   *  supplied by `Root` -- additive and optional so `App.test.tsx`'s own
   *  `<App />` (no props) stays byte-identical in behaviour. `null`/
   *  `undefined` renders nothing extra in the toolbar. */
  switcher?: ReactNode;
}

export function App({ switcher }: AppProps) {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  // The map a tree click (or lens list jump) last asked WorldCanvas to jump
  // to -- separate from `selected`, which a plain world click also changes
  // (see GbcApp's own jumpTarget comment for the spec-review F1 postmortem:
  // passing `selected` as jumpToMap made the first canvas click jump).
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
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

  // Plan 6c E2: map-editing state and handlers (selected event, tool/dialog
  // state, event ops, discard) -- see useMapEditing.ts. Called here, at the same
  // spot the state used to live, so its lifetime is unchanged.
  const editing = useMapEditing({ editSession, layoutData: layout.data });

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

  // The dirty guard and the per-map resets shared by a tree click and a
  // world click. Returns false when the user cancelled the guard.
  const changeSelection = (name: string): boolean => {
    if (editSession.isDirty && !window.confirm("You have unsaved changes on this map. Discard them and switch maps?")) {
      return false;
    }
    setSelected(name);
    // Per-map resets (selected event, stale stamp) live with the state they
    // reset -- see useMapEditing.ts's own resetForMapChange comments.
    editing.resetForMapChange();
    return true;
  };

  const selectMap = (name: string) => {
    if (!changeSelection(name)) return;
    setJumpTarget(name);
    setSelectVersion((v) => v + 1);
  };

  // A world-view click selects (tree highlight + scroll) but is not a jump
  // request. Re-clicking the already-selected map must not raise the
  // "discard and switch" confirm.
  const selectMapFromWorld = (name: string) => {
    if (name !== selected) changeSelection(name);
  };

  // Entering World centres on the selected map, wherever the selection came from (tree, world click,
  // Map view). A world click itself never jumps (F1); this is a mode entry, not a click.
  const enterWorld = () => {
    if (mode === "world") return;
    setJumpTarget(selected);
    setSelectVersion((v) => v + 1);
    setMode("world");
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
            onClick={enterWorld}
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
        {switcher}
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
            <WorldCanvas
              key="world"
              jumpToMap={jumpTarget}
              jumpToken={selectVersion}
              onJumpToMap={selectMap}
              onSelectMap={selectMapFromWorld}
            />
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
            <MapEditingWorkspace mapName={selected} data={layout.data} editSession={editSession} editing={editing} />
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
          {editing.saveDialogOpen && selected && (
            <SaveDialog
              mapName={selected}
              // markClean() first: found live (see useEditSession.ts's own
              // doc comment on markClean) -- SaveDialog's commit call
              // bypasses this hook entirely, so without this the Toolbar's
              // dirty dot would stay on after a real, successful save.
              onCommitted={() => {
                editSession.markClean();
                editing.setSaveDialogOpen(false);
              }}
              onCancel={() => editing.setSaveDialogOpen(false)}
            />
          )}
          {/* Task 17: SignComposer owns its own modal shell exactly like
              SaveDialog above (Step 10's own design correction) -- App.tsx
              just conditionally renders it as a sibling, same stacking-
              context reasoning as SaveDialog's own comment just above. */}
          {editing.signComposerOpen && selected && (
            <SignComposer
              mapName={selected}
              onSessionUpdated={(map, isDirty) => editSession.applyExternalMapUpdate(map, isDirty)}
              onAdded={(scriptLabel) => {
                editing.setSignComposerOpen(false);
                editing.setSignAddedMessage(`Added wild sign: ${scriptLabel}`);
              }}
              onCancel={() => editing.setSignComposerOpen(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
