import { useMemo, useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { DungeonSidebar } from "./components/DungeonSidebar.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";
import { useDungeons } from "./hooks/useDungeons.js";

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

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
  };

  // `.find()` over `dungeons.data` returns the SAME element reference every
  // render as long as the array itself hasn't been replaced (only true
  // after a real create/rename/setMaps/remove -- see useDungeons's own
  // `gen`-driven refetch) -- so `openDungeon`'s identity is stable across
  // unrelated App re-renders, which is what lets the mapFilter memo below
  // (and, inside WorldCanvas, its own mapFilter-keyed auto-fit effect) fire
  // only when the open dungeon genuinely changes.
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
    if (openDungeonId === id) setOpenDungeonId(null);
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
          ) : error ? (
            <p className="map-tree__empty">Could not load map groups: {error}</p>
          ) : data ? (
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
            <WorldCanvas jumpToMap={selected} jumpToken={selectVersion} />
          ) : mode === "dungeon" ? (
            openDungeon ? (
              <WorldCanvas mapFilter={mapFilter} />
            ) : (
              <p className="app__canvas-placeholder">Select or create a dungeon</p>
            )
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : layout.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {layout.error}</p>
          ) : layout.data ? (
            <MapCanvas mapName={selected} data={layout.data} />
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
        </main>
      </div>
    </div>
  );
}
