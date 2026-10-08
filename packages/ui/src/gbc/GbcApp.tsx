import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapTree } from "../components/MapTree.js";
import { useGbcGroups } from "./hooks/useGbcGroups.js";
import { useGbcMap } from "./hooks/useGbcMap.js";
import { GbcMapEditing } from "./GbcMapEditing.js";
import { useGbcEditSession } from "./hooks/useGbcEditSession.js";
import { SaveDialog } from "../components/SaveDialog.js";
import { GbcWorldCanvas } from "./GbcWorldCanvas.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import { GBC_HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { DungeonSidebar } from "../components/DungeonSidebar.js";
import { useGbcDungeons } from "./hooks/useGbcDungeons.js";
import type { GbcTimeOfDay } from "./time.js";

type Mode = "map" | "world" | "dungeon";
/** Fix round (quality review finding 3): re-exported from the shared
 *  `gbc/time.ts` (was independently declared here) so a future Task 5/6
 *  consumer of `GbcApp`'s own time type doesn't need to know it moved. */
export type TimeOfDay = GbcTimeOfDay;

const TIME_ORDER: readonly TimeOfDay[] = ["morn", "day", "nite"];
const TIME_LABEL: Record<TimeOfDay, string> = { morn: "Morn", day: "Day", nite: "Nite" };

export interface GbcAppProps {
  /** The project root `Root.tsx` read off `/api/hub`. Not yet read by
   *  this task's own rendering -- kept on the props so Root's routing stays
   *  stable while Tasks 4/5 wire it into GbcMapCanvas/GbcWorldCanvas. */
  root: string;
  /** Plan 6c A2: the header's project-switcher button (`ProjectSwitcher`),
   *  supplied by `Root` -- additive and optional so `GbcApp.test.tsx`'s own
   *  calls (no `switcher`) stay byte-identical in behaviour. */
  switcher?: ReactNode;
}

/**
 * The GBC shell (Plan 6b Tasks 3-4; editing added in Plan 7 Task 5). Smaller
 * than `App.tsx`: no `SignComposer` or `CollisionPalette`. Editing is mounted
 * through `GbcMapEditing`; the edit session, `SaveDialog`, the dirty-switch
 * guard and the `beforeunload` handler live here, as their GBA twins live in
 * `App.tsx`.
 *
 * Reuses the GBA shell's own layout classes (`app`, `app__toolbar`,
 * `app__title`, `app__body`, `app__sidebar`, `app__canvas`,
 * `app__canvas-placeholder`, `app__status`, `app__mode`, `app__map-editing`,
 * `app__map-editing-body`, `app__event-op-error`) so the two shells look
 * identical apart from the family tag, the extra Time-of-day group (Q3: one
 * app-level setting, not per-view), and the non-dismissible defect banner.
 * Loading/error states for the map view mirror `App.tsx:495-499` exactly.
 */
export function GbcApp({ root, switcher }: GbcAppProps) {
  const [mode, setMode] = useState<Mode>("map");
  const [time, setTime] = useState<TimeOfDay>("day");
  const [selected, setSelected] = useState<string | null>(null);
  // The map a TREE click last asked GbcWorldCanvas to jump to -- separate
  // from `selected` (fix round, spec review F1). `selected` also changes on
  // a plain CANVAS click (selectMapFromWorld below), and passing `selected`
  // itself as `jumpToMap` meant the canvas's own click silently changed
  // GbcWorldCanvas's jump TARGET too: the jump effect's "retry once world
  // itself changes" guard only records a token as applied once it has a
  // real `jumpToMap` to act on, so the very FIRST canvas click (with
  // `selected` still null beforehand) turned `jumpToMap` non-null for the
  // first time and triggered a full jump -- confirmed live (spec review
  // probe P3: a single canvas click on a fresh load re-zoomed and flashed
  // the jump outline). Keeping this as its own state, set ONLY by tree
  // clicks (selectMap below), means a canvas click can never touch it.
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  // Bumped on every tree click, mirroring App.tsx's own selectVersion --
  // GbcWorldCanvas's own jumpToken, distinct from jumpToMap so a re-click of
  // the same map name still jumps (see App.tsx's own selectVersion doc
  // comment).
  const [selectVersion, setSelectVersion] = useState(0);
  // The hovered block's metatile id (GbcMapCanvas's own hoveredMetatile
  // callback), driving GbcMetatilePalette's highlight -- reset on a real map
  // switch so a stale highlight from the PREVIOUS map's tileset never
  // survives onto a freshly selected one.
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);
  const [manualPlacementMaps, setManualPlacementMaps] = useState<ReadonlySet<string>>(new Set());
  const [openDungeonId, setOpenDungeonId] = useState<string | null>(null);
  const dungeons = useGbcDungeons(mode === "dungeon");

  const { data, error } = useGbcGroups();
  const { data: world, error: worldError } = useGbcWorld(mode === "world");
  const worldVisibility = useMemo(
    () => world && new Map(Object.entries(world.placements).map(([name, placement]) => [name, { mapType: placement.mapType, manual: placement.manual || manualPlacementMaps.has(name) }])),
    [world, manualPlacementMaps],
  );
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
  // Plan 7 Task 5: the edit session for whatever map is `selected`, tracked here and never gated on `mode`, so a
  // World/Dungeon round trip cannot lose the client's view of a session the server still holds dirty (the
  // reasoning at App.tsx:50-62). Seeded from the ready payload only: `ready` already ignores the previous map's.
  const session = useGbcEditSession(selected, ready?.blocks, ready?.events);
  const [saveOpen, setSaveOpen] = useState(false);
  // A failed discard-before-switch: the switch is abandoned and this says why.
  const [switchError, setSwitchError] = useState<string | null>(null);

  // I6: no silent loss of a dirty session -- closing the tab (this effect) and switching maps (`leave`).
  // Registered only while dirty: an always-attached handler would prompt on a clean tab.
  useEffect(() => {
    if (!session.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [session.isDirty]);

  // Every change of `selected` goes through this: tree click, world click, world double-click, jump. A clean
  // session just proceeds. A dirty one needs GBA's exact confirm, then the server session is discarded BEFORE the
  // switch (the hook is keyed on `selected`, so switching first would orphan a dirty server session the client
  // can no longer see). A failed discard keeps the user on the map with the reason shown.
  // The Map tab itself changes no selection, so entering it from World needs no guard of its own: the world click
  // that moved the selection already passed through here.
  const leave = (go: () => void) => {
    if (!session.isDirty) { go(); return; }
    if (!window.confirm("You have unsaved changes on this map. Discard them and switch maps?")) return;
    session.discard().then(go).catch((e: unknown) => setSwitchError(e instanceof Error ? e.message : "Could not discard the changes."));
  };
  const openDungeon = mode === "dungeon" ? dungeons.data?.find((d) => d.id === openDungeonId) ?? null : null;
  const filterCache = useRef<{ id: string; members: string[]; filter: Set<string> } | null>(null);
  const mapFilter = useMemo(() => {
    if (!openDungeon) { filterCache.current = null; return null; }
    const members = [...openDungeon.maps].sort();
    const cached = filterCache.current;
    if (cached?.id === openDungeon.id && cached.members.length === members.length
      && members.every((name, index) => name === cached.members[index])) return cached.filter;
    const filter = new Set(openDungeon.maps);
    filterCache.current = { id: openDungeon.id, members, filter };
    return filter;
  }, [openDungeon]);
  const allMapNames = useMemo(() => data ? data.groupOrder.flatMap((group) => data.groups[group] ?? []) : [], [data]);
  const deleteDungeon = async (id: string) => {
    await dungeons.remove(id);
    setOpenDungeonId((current) => current === id ? null : current);
  };

  const selectMap = (name: string) => {
    const go = () => {
      setSwitchError(null);
      setSelected(name);
      setJumpTarget(name);
      setSelectVersion((v) => v + 1);
      setHoveredMetatileId(null);
    };
    if (name === selected) go(); else leave(go);
  };

  // GbcWorldCanvas's own single-click selection (Task 5): keeps the sidebar
  // tree's highlight in sync with whatever was last clicked on the canvas,
  // the same way clicking a tree row does -- but does NOT bump
  // selectVersion (a canvas click is not a "jump" request; only a TREE
  // click is, per the spec's own "tree clicks in World mode jump" rule) and
  // does NOT switch mode.
  const selectMapFromWorld = (name: string) => {
    if (name !== selected) leave(() => { setSwitchError(null); setSelected(name); });
  };
  const markManualPlacement = (name: string) => setManualPlacementMaps((previous) => previous.has(name) ? previous : new Set(previous).add(name));

  // Entering World centres on the selected map, wherever the selection came from (tree, world click,
  // Map view). A world click itself never jumps (F1); this is a mode entry, not a click.
  const enterWorld = () => {
    if (mode === "world") return;
    setJumpTarget(selected);
    setSelectVersion((v) => v + 1);
    setMode("world");
  };

  // GbcWorldCanvas's own double-click (Task 5): opens the map in Map view.
  const openMapFromWorld = (name: string) => {
    const go = () => {
      setSwitchError(null);
      setSelected(name);
      setHoveredMetatileId(null);
      setMode("map");
    };
    if (name === selected) go(); else leave(go);
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
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "world"} onClick={enterWorld}>
            World
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "dungeon"} onClick={() => setMode("dungeon")}>
            Dungeon
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
        {switcher}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {error && <p className="map-tree__empty">Could not load map groups: {error}</p>}
          {mode === "world" && worldError && <p className="map-tree__empty">Could not load world visibility: {worldError}</p>}
          {mode === "dungeon" ? <DungeonSidebar
            dungeons={dungeons.data} error={dungeons.error} openId={openDungeonId} onOpen={setOpenDungeonId}
            onCreate={dungeons.create} onRename={dungeons.rename} onSetMaps={dungeons.setMaps} onDelete={deleteDungeon} allMapNames={allMapNames}
          /> : error ? null : data ? (
            <MapTree data={data} selected={selected} onSelect={selectMap} worldMode={mode === "world"} visibility={worldVisibility} hiddenMapTypes={GBC_HIDDEN_MAP_TYPES} />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            <GbcWorldCanvas
              key="world"
              time={time}
              jumpToMap={jumpTarget}
              jumpToken={selectVersion}
              onSelectMap={selectMapFromWorld}
              onOpenMap={openMapFromWorld}
              onJumpToMap={selectMap}
              onPlacementSaved={markManualPlacement}
            />
          ) : mode === "dungeon" ? (
            openDungeon ? <GbcWorldCanvas key="dungeon" time={time} mapFilter={mapFilter} onOpenMap={openMapFromWorld} onPlacementSaved={markManualPlacement} />
              : <p className="app__canvas-placeholder">Select or create a dungeon</p>
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
              {switchError && (
                <div className="app__event-op-error" role="alert">
                  <span>{switchError}</span>
                  <button type="button" className="app__event-op-error-dismiss" onClick={() => setSwitchError(null)} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              )}
              <GbcMapEditing
                mapName={selected}
                data={ready}
                time={time}
                session={session}
                hoveredMetatileId={hoveredMetatileId}
                onHoverMetatile={setHoveredMetatileId}
                onOpenSave={() => setSaveOpen(true)}
              />
            </div>
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
          {/* At <main> level, not inside the map branch, for the stacking reason App.tsx documents on its own
              SaveDialog. markClean first: the dialog's commit is a plain fetch that closes the server session
              behind the hook's back. Then the payload is re-read so the canvas and palette show what is on disk. */}
          {saveOpen && selected && (
            <SaveDialog
              mapName={selected}
              onCommitted={() => {
                session.markClean();
                setSaveOpen(false);
                map.reload().catch((e: unknown) => setSwitchError(`Saved, but could not reload the map: ${e instanceof Error ? e.message : String(e)}`));
              }}
              onCancel={() => setSaveOpen(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
