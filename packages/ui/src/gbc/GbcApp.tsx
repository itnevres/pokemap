import { useState } from "react";
import { MapTree } from "../components/MapTree.js";
import { useGbcGroups } from "./useGbcGroups.js";

type Mode = "map" | "world";
export type TimeOfDay = "morn" | "day" | "nite";

const TIME_ORDER: readonly TimeOfDay[] = ["morn", "day", "nite"];
const TIME_LABEL: Record<TimeOfDay, string> = { morn: "Morn", day: "Day", nite: "Nite" };

export interface GbcAppProps {
  /** The project root `Root.tsx` read off `/api/project`. Not yet used to
   *  render anything in this task -- kept on the props so Root's routing
   *  stays stable while Tasks 4/5 wire it into GbcMapCanvas/GbcWorldCanvas. */
  root: string;
}

/**
 * The GBC shell (Plan 6b Task 3). Deliberately much smaller than `App.tsx`:
 * GBC is read-only in 6b, so this never mounts `Toolbar`, `SaveDialog`,
 * `EventInspector`, `DungeonSidebar`, `SignComposer`, `CollisionPalette` or
 * `MetatilePalette`, and wires no `beforeunload` handler.
 *
 * Reuses the GBA shell's own layout classes (`app`, `app__toolbar`,
 * `app__title`, `app__body`, `app__sidebar`, `app__canvas`,
 * `app__canvas-placeholder`, `app__status`, `app__mode`) so the two shells
 * look identical apart from the family tag and the extra Time-of-day group
 * (Q3: one app-level setting, not per-view).
 */
export function GbcApp({ root: _root }: GbcAppProps) {
  const [mode, setMode] = useState<Mode>("map");
  const [time, setTime] = useState<TimeOfDay>("day");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every tree click, mirroring App.tsx's own selectVersion --
  // unused by this task's placeholders, but Task 5's GbcWorldCanvas needs a
  // jumpToken distinct from jumpToMap for a re-click of the same map name
  // (see App.tsx's own selectVersion doc comment).
  const [, setSelectVersion] = useState(0);

  const { data, error } = useGbcGroups();

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
  };

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        <span className="gbc-app__family">Crystal</span>
        <div className="app__mode" role="group" aria-label="View">
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "map"} onClick={() => setMode("map")}>
            Map
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "world"} onClick={() => setMode("world")}>
            World
          </button>
        </div>
        <div className="app__mode gbc-app__time" role="group" aria-label="Time of day">
          {TIME_ORDER.map((t) => (
            <button key={t} type="button" className="map-canvas__btn" aria-pressed={time === t} onClick={() => setTime(t)}>
              {TIME_LABEL[t]}
            </button>
          ))}
        </div>
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {error && <p className="map-tree__empty">Could not load map groups: {error}</p>}
          {error ? null : data ? (
            <MapTree data={data} selected={selected} onSelect={selectMap} />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            // Task 5 replaces this with GbcWorldCanvas.
            <p className="app__canvas-placeholder" data-testid="gbc-world-placeholder">
              World view (Task 5)
            </p>
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : (
            // Task 4 replaces this with GbcMapCanvas. Pins that `time` and
            // `selected` both reach the view.
            <p className="app__canvas-placeholder" data-testid="gbc-map-placeholder">
              {selected} · {time}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
