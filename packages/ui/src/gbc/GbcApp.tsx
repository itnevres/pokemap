import { useState } from "react";
import { MapTree } from "../components/MapTree.js";
import { useGbcGroups } from "./hooks/useGbcGroups.js";
import { useGbcMap } from "./hooks/useGbcMap.js";
import { GbcMapCanvas } from "./GbcMapCanvas.js";
import { GbcMetatilePalette } from "./GbcMetatilePalette.js";
import type { GbcTimeOfDay } from "./time.js";

type Mode = "map" | "world";
/** Fix round (quality review finding 3): re-exported from the shared
 *  `gbc/time.ts` (was independently declared here) so a future Task 5/6
 *  consumer of `GbcApp`'s own time type doesn't need to know it moved. */
export type TimeOfDay = GbcTimeOfDay;

const TIME_ORDER: readonly TimeOfDay[] = ["morn", "day", "nite"];
const TIME_LABEL: Record<TimeOfDay, string> = { morn: "Morn", day: "Day", nite: "Nite" };

export interface GbcAppProps {
  /** The project root `Root.tsx` read off `/api/project`. Not yet read by
   *  this task's own rendering -- kept on the props so Root's routing stays
   *  stable while Tasks 4/5 wire it into GbcMapCanvas/GbcWorldCanvas. */
  root: string;
}

/**
 * The GBC shell (Plan 6b Tasks 3-4). Deliberately much smaller than
 * `App.tsx`: GBC is read-only in 6b, so this never mounts `Toolbar`,
 * `SaveDialog`, `EventInspector`, `DungeonSidebar`, `SignComposer` or
 * `CollisionPalette`, and wires no `beforeunload` handler.
 *
 * Reuses the GBA shell's own layout classes (`app`, `app__toolbar`,
 * `app__title`, `app__body`, `app__sidebar`, `app__canvas`,
 * `app__canvas-placeholder`, `app__status`, `app__mode`, `app__map-editing`,
 * `app__map-editing-body`, `app__event-op-error`) so the two shells look
 * identical apart from the family tag, the extra Time-of-day group (Q3: one
 * app-level setting, not per-view), and the non-dismissible defect banner.
 * Loading/error states for the map view mirror `App.tsx:495-499` exactly.
 */
export function GbcApp({ root }: GbcAppProps) {
  const [mode, setMode] = useState<Mode>("map");
  const [time, setTime] = useState<TimeOfDay>("day");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every tree click, mirroring App.tsx's own selectVersion --
  // unused by this task's own rendering, but Task 5's GbcWorldCanvas needs a
  // jumpToken distinct from jumpToMap for a re-click of the same map name
  // (see App.tsx's own selectVersion doc comment).
  const [, setSelectVersion] = useState(0);
  // The hovered block's metatile id (GbcMapCanvas's own hoveredMetatile
  // callback), driving GbcMetatilePalette's highlight -- reset on a real map
  // switch so a stale highlight from the PREVIOUS map's tileset never
  // survives onto a freshly selected one.
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);

  const { data, error } = useGbcGroups();
  const map = useGbcMap(selected);
  // Fix round (spec review finding 3): `useGuardedFetch` now resets
  // `data`/`error` on every URL change, but there is still one render tick
  // between `selected` changing and that reset effect actually running
  // where `map.data` can still be the PREVIOUS map's payload. Requiring
  // `map.data.map.name === selected` (not just `map.data` truthy) means the
  // canvas/palette/banner only ever render a payload that actually belongs
  // to the currently selected map -- never the previous one's data rendered
  // under the new one's name, and never the previous one's Fit/pan/defects.
  const ready = map.data && map.data.map.name === selected ? map.data : null;

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
    setHoveredMetatileId(null);
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
          ) : map.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {map.error}</p>
          ) : ready ? (
            <div className="app__map-editing">
              {/* Non-dismissible: G4's "never a silent drop" data truth (an
                  oversize .blk, an out-of-bounds event), not a one-shot
                  notice about something the player just did -- so unlike
                  App.tsx's own eventOpError/signAddedMessage banners, this
                  one carries no dismiss button and never clears itself. */}
              {ready.defects.length > 0 && (
                <div className="app__event-op-error" role="alert">
                  <ul className="gbc-app__defects-list">
                    {ready.defects.map((d, i) => (
                      <li key={i}>{d.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="app__map-editing-body">
                <GbcMapCanvas mapName={selected} data={ready} time={time} hoveredMetatile={setHoveredMetatileId} />
                <GbcMetatilePalette
                  mapName={selected}
                  time={time}
                  tilesetName={ready.tileset.constName}
                  metatileCount={ready.metatileCount}
                  highlightId={hoveredMetatileId}
                />
              </div>
            </div>
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
        </main>
      </div>
    </div>
  );
}
