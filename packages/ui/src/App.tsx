import { useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";

type Mode = "map" | "world";

export function App() {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error } = useMapGroups();
  const layout = useMapLayout(selected);

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
            <MapTree data={data} selected={selected} onSelect={setSelected} />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            <WorldCanvas />
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
