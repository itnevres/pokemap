import { useEffect, useMemo, useState } from "react";
import { GbcMapEditing, type GbcMapEditingCanvasProps } from "./GbcMapEditing.js";
import { GbcMapCanvas, GBC_COMPOSITE_ORIGIN } from "./GbcMapCanvas.js";
import { GbcWorldCanvas } from "./GbcWorldCanvas.js";
import { DefectsBanner } from "../shared/DefectsBanner.js";
import { useGbcGroups } from "./hooks/useGbcGroups.js";
import { useGbcMap } from "./hooks/useGbcMap.js";
import { PokemonIndicatorDialog } from "../components/PokemonIndicatorDialog.js";
import type { IndicatorBlock } from "@pokemap/core/src/indicator/gba.js";
import { useGbcEditSession, isSessionBody } from "./hooks/useGbcEditSession.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import { useGbcDungeons } from "./hooks/useGbcDungeons.js";
import type { GbcTimeOfDay } from "./time.js";
import { GBC_HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { GBC_CAPABILITIES, type EngineAdapter, type FamilyRuntime, type RuntimeArgs, type ShellSlots } from "../shell/adapter.js";

const TIME_ORDER: readonly GbcTimeOfDay[] = ["morn", "day", "nite"];
const TIME_LABEL: Record<GbcTimeOfDay, string> = { morn: "Morn", day: "Day", nite: "Nite" };

/** The GBC-only half of the shell (was GbcApp.tsx): time of day, data hooks, edit session, discard-before-switch,
 *  switchError, defects banner, canvases. */
export function useGbcRuntime({ selected, mode, requestPrompt }: RuntimeArgs): FamilyRuntime {
  const [time, setTime] = useState<GbcTimeOfDay>("day");
  // The hovered block's metatile id (GbcMapCanvas's own hoveredMetatile
  // callback), driving GbcMetatilePalette's highlight -- reset on a real map
  // switch so a stale highlight from the PREVIOUS map's tileset never
  // survives onto a freshly selected one.
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);
  const dungeons = useGbcDungeons(mode === "dungeon");
  const groups = useGbcGroups();
  const { data: world, error: worldError, reload: reloadWorld } = useGbcWorld(mode === "world");
  // Tree visibility before FamilyApp merges this session's manual placements (FamilyApp's SR8 merge).
  const placed = useMemo(
    () => world ? new Map(Object.entries(world.placements).map(([name, p]) => [name, { mapType: p.mapType, manual: p.manual }])) : null,
    [world],
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
  const [indicator, setIndicator] = useState<{ mapName: string; edit?: { index: number; block: IndicatorBlock } } | null>(null);
  const [indicatorMessage, setIndicatorMessage] = useState<string | null>(null);
  useEffect(() => { setIndicator(null); }, [selected]);
  // A failed discard-before-switch (or post-save reload): the switch is abandoned and this says why.
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Every change of `selected` goes through this: tree click, world click, world double-click, jump. A clean
  // session just proceeds. A dirty one needs GBA's exact confirm, then the server session is discarded BEFORE the
  // switch (the hook is keyed on `selected`, so switching first would orphan a dirty server session the client
  // can no longer see). A failed discard keeps the user on the map with the reason shown.
  // The Map tab itself changes no selection, so entering it from World needs no guard of its own: the world click
  // that moved the selection already passed through here.
  // `sameMap` (a tree click on the selected map, GbcApp.tsx:159): no prompt and no discard.
  // Plan 10a: the shared shell now owns the prompt and waits for strokes before server discard.
  const leave = (go: () => void, { sameMap }: { sameMap: boolean }) => {
    if (sameMap || !session.isDirty) go();
    else requestPrompt(go);
  };

  const defectsBanner = ready && <DefectsBanner key={selected} defects={ready.defects} />;

  const editingProps = {
    time, session, hoveredMetatileId,
    onHoverMetatile: setHoveredMetatileId,
    onOpenSave: () => setSaveOpen(true),
    onOpenIndicator: (edit?: { index: number; block: IndicatorBlock }) => { if (selected) setIndicator({ mapName: selected, edit }); },
    indicatorMessage,
    onDismissIndicatorMessage: () => setIndicatorMessage(null),
    onDiscarded: () => setSwitchError(null),
  };

  const renderWorld = (s: ShellSlots) => {
    // The World view is hosted by GbcMapEditing at all times (one stable element and key), so the GbcWorldCanvas inside is
    // never remounted when in-context editing turns the chrome on or off. The overlay's canvas is built from the SAME props
    // GbcMapEditing assembles for Map view, plus chromeless and the controlled view.
    const contextActive = s.contextMap !== null && ready !== null;
    const world = (canvasProps: GbcMapEditingCanvasProps | null) => (
      <GbcWorldCanvas
        key="world"
        time={time}
        jumpToMap={s.jumpTarget}
        jumpToken={s.jumpToken}
        onSelectMap={s.selectMapFromWorld}
        onOpenMap={s.openMapFromWorld}
        onEditHere={s.enterContext}
        onJumpToMap={s.selectMap}
        onPlacementSaved={(name) => { s.markManualPlacement(name); reloadWorld(); }}
        onLayoutChanged={reloadWorld}
        tileVersions={s.tileVersions}
        context={
          s.contextMap === null
            ? undefined
            : {
                map: s.contextMap,
                origin: ready ? { x: GBC_COMPOSITE_ORIGIN, y: GBC_COMPOSITE_ORIGIN } : null,
                renderCanvas: (view, onViewChange) =>
                  canvasProps && ready ? <GbcMapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} /> : null,
                onExitRequest: s.requestExitContext,
              }
        }
      />
    );
    return (
      <div className="app__map-editing" key="world-host">
        {contextActive && defectsBanner}
        {s.contextMap !== null && !ready && (
          map.error ? <p className="app__event-op-error" role="alert">Could not load {s.contextMap}: {map.error}</p>
            : <p className="app__canvas-placeholder" role="status">Loading {s.contextMap}…</p>
        )}
        <GbcMapEditing onStrokeChain={s.onStrokeChain} active={contextActive} mapName={selected} data={ready} {...editingProps} renderCanvas={world} />
      </div>
    );
  };

  return {
    groups,
    session,
    leave,
    setSwitchError,
    onSelected: () => { setSwitchError(null); setHoveredMetatileId(null); },
    onEnterContext: (name) => { if (name === selected) { setSwitchError(null); setHoveredMetatileId(null); } },
    visibility: { placed, error: worldError },
    hiddenMapTypes: GBC_HIDDEN_MAP_TYPES,
    dungeons,
    map: { error: map.error, ready: ready !== null },
    renderMap: (s) =>
      selected && ready ? (
        <div className="app__map-editing">
          {defectsBanner}
          <GbcMapEditing onStrokeChain={s.onStrokeChain} mapName={selected} data={ready} {...editingProps} />
        </div>
      ) : null,
    renderWorld,
    renderDungeon: (mapFilter, s) => (
      <GbcWorldCanvas key="dungeon" time={time} mapFilter={mapFilter} onOpenMap={s.openMapFromWorld} onPlacementSaved={s.markManualPlacement} onLayoutChanged={reloadWorld} />
    ),
    headerExtras: (
      <div className="app__mode gbc-app__time" role="group" aria-label="Time of day">
        {TIME_ORDER.map((t) => (
          <button key={t} type="button" className="map-canvas__btn" aria-pressed={time === t} onClick={() => setTime(t)}>
            {TIME_LABEL[t]}
          </button>
        ))}
      </div>
    ),
    // At <main> level so a failed discard-before-switch (or a failed post-save reload) is visible in EVERY
    // mode: a world click or double-click abandons the switch, and the user is still in World.
    banners: switchError && (
      <div className="app__event-op-error" role="alert">
        <span>{switchError}</span>
        <button type="button" className="app__event-op-error-dismiss" onClick={() => setSwitchError(null)} aria-label="Dismiss">
          ×
        </button>
      </div>
    ),
    modals: indicator && indicator.mapName === selected ? (
      <PokemonIndicatorDialog key={`${selected}:${indicator.edit?.index ?? "add"}`} mapName={indicator.mapName} edit={indicator.edit}
        onCancel={() => setIndicator(null)}
        onDone={(scriptLabel, payload) => {
          if (!isSessionBody(payload) || payload.events === null) throw new Error("Invalid Indicator session response.");
          session.applyExternalSession?.(payload);
          setIndicator(null);
          setIndicatorMessage(`${indicator.edit ? "Updated" : "Placed"} Pok\u00e9mon Indicator: ${scriptLabel}`);
        }} />
    ) : null,
    saveDialog: {
      open: saveOpen,
      setOpen: setSaveOpen,
      // After ctx.onCommitted(): re-read the payload so the canvas and palette show what is on disk (GbcApp.tsx:345-349).
      onCommitted: () => {
        map.reload().catch((e: unknown) => setSwitchError(`Saved, but could not reload the map: ${e instanceof Error ? e.message : String(e)}`));
      },
    },
  };
}

export const gbcAdapter: EngineAdapter = {
  family: "gbc",
  label: "Crystal",
  capabilities: GBC_CAPABILITIES,
  useRuntime: useGbcRuntime,
};
