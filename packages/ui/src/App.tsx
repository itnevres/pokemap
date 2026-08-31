import { useEffect, useState } from "react";
import { MapTree, type MapGroupsData } from "./components/MapTree.js";

export function App() {
  const [data, setData] = useState<MapGroupsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/groups")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/groups -> ${r.status}`);
        return r.json() as Promise<MapGroupsData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        {selected && <span className="app__status">{selected}</span>}
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
          {selected ? `${selected} — canvas arrives in Task 21` : "Select a map"}
        </main>
      </div>
    </div>
  );
}
