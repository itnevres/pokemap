import { useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";
import { useWorldVisibility } from "./hooks/useWorldVisibility.js";

type Mode = "map" | "world";

export function App() {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  const { data, error } = useMapGroups();
  const layout = useMapLayout(selected);
  // Gated on World mode specifically, not "not Map mode" -- Dungeon mode's
  // own sidebar (a later task) is DungeonSidebar, not MapTree (this hook's
  // only consumer), so fetching this in Dungeon mode too would be wasted
  // work nothing reads.
  const { placed: worldVisibility } = useWorldVisibility(mode === "world");

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
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
        </div>
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {error ? (
            <p className="map-tree__empty">Could not load map groups: {error}</p>
          ) : data ? (
            <MapTree
              data={data}
              selected={selected}
              onSelect={selectMap}
              worldMode={mode === "world"}
              visibility={worldVisibility}
            />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            <WorldCanvas jumpToMap={selected} jumpToken={selectVersion} />
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
