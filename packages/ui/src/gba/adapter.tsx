import { addEventFields, addEventDefaults } from "./addEventFields.js";
import { DefectsBanner } from "../shared/DefectsBanner.js";
import { useMapDefects } from "../hooks/useMapDefects.js";
import { useEffect, useRef, useState } from "react";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../components/MapEditingWorkspace.js";
import { MapCanvas, compositeOrigin } from "../components/MapCanvas.js";
import { WorldCanvas } from "../components/WorldCanvas.js";
import { PokemonIndicatorDialog } from "../components/PokemonIndicatorDialog.js";
import { useMapGroups } from "../hooks/useMapGroups.js";
import { brokenPathToDefect, useMapLayout } from "../hooks/useMapLayout.js";
import { useWorldVisibility } from "../hooks/useWorldVisibility.js";
import { useDungeons } from "../hooks/useDungeons.js";
import { useEditSession, isIndicatorMapUpdate } from "../hooks/useEditSession.js";
import { useMapEditing } from "../hooks/useMapEditing.js";
import { useTilesetVersion } from "../shared/tilesetVersion.js";
import { HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { GBA_CAPABILITIES, type BlockEditorSpec, type EngineAdapter, type FamilyRuntime, type RuntimeArgs, type ShellSlots } from "../shell/adapter.js";
import { errorMessage } from "@pokemap/core/src/errorMessage.js";

/** The GBA-only half of the shell (was App.tsx): data hooks, edit session, map editing state, switch policy, canvases. */
export function useGbaRuntime({ selected, mode, requestPrompt }: RuntimeArgs): FamilyRuntime {
  const [saveToken, setSaveToken] = useState(0);
  const { defects, incomplete, error: defectsError } = useMapDefects(selected, saveToken);
  const defectsBanner = <DefectsBanner key={selected} defects={defects} incomplete={incomplete} error={defectsError} />;
  const groups = useMapGroups();
  const layout = useMapLayout(selected);
  // Q7 (b): another map's block-editor append/undo on a SHARED tileset changes this map's effective
  // metatile counts, and the hub announces it only through `tilesetVersion` (the map payload's own
  // counts are recomputed server-side). Re-read this map's payload when that moves so the palette is
  // right even with no session open here -- passive, so a failure is swallowed; the first version this
  // hook sees is its mount value, not a change.
  const tilesetVersion = useTilesetVersion();
  const seenTilesetVersion = useRef(tilesetVersion);
  const reloadLayout = layout.reload;
  useEffect(() => {
    if (seenTilesetVersion.current === tilesetVersion) return;
    seenTilesetVersion.current = tilesetVersion;
    void reloadLayout().catch(() => {});
  }, [tilesetVersion, reloadLayout]);
  // Known limitation, accepted for now (predates this task): this is a
  // snapshot taken once per World-mode entry, not a live subscription -- it
  // can go stale within the session after a drag or a jump-reveal on
  // WorldCanvas's own canvas. A full refresh currently requires leaving and
  // re-entering World mode.
  const { placed, error: visibilityError, refresh: refreshVisibility } = useWorldVisibility(mode === "world");
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
  const [switchError, setSwitchError] = useState<string | null>(null);
  const selectedNow = useRef(selected);
  useEffect(() => { selectedNow.current = selected; }, [selected]);

  // Plan 6c E2: map-editing state and handlers (selected event, tool/dialog
  // state, event ops, discard) -- see useMapEditing.ts. Called here, at the same
  // spot the state used to live, so its lifetime is unchanged.
  const editing = useMapEditing({ editSession, layoutData: layout.data, mapName: selected });

  // Plan 9 (R2): the hovered block's metatile id, driving the palette highlight; cleared on every map switch
  // (onSelected) so the previous map's highlight never shows on the next one.
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);

  // GBA's switch policy (App.tsx:76-79): confirm when dirty, then switch; the server session is never discarded here.
  // `sameMap` is ignored on purpose: a tree re-click of the selected map prompts too (App.tsx:96-102).
  // Plan 10a supersedes the policy above: same-map bypass; the shell owns prompt and server discard.
  const leave = (go: () => void, { sameMap }: { sameMap: boolean }) => {
    if (sameMap || !editSession.isDirty) go();
    else requestPrompt(go);
  };

  // The context map's layout, once loaded for THAT map (useMapLayout keeps the previous map's data until its fetch lands).
  const contextLayoutFor = (contextMap: string | null) =>
    contextMap !== null && layout.data && layout.data.map.name === contextMap ? layout.data : null;

  const renderWorld = (s: ShellSlots) => {
    const contextLayout = contextLayoutFor(s.contextMap);
    const world = (canvasProps: MapEditingCanvasProps | null) => (
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
        jumpToMap={s.jumpTarget}
        jumpToken={s.jumpToken}
        onJumpToMap={s.selectMap}
        onSelectMap={s.selectMapFromWorld}
        onOpenMap={s.openMapFromWorld}
        onEditHere={s.enterContext}
        onOpenWarpDestination={s.openWarpDestination}
        tileVersions={s.tileVersions}
        onPlacementsSaved={(names) => { names.forEach(s.markManualPlacement); refreshVisibility(); }}
        onLayoutChanged={refreshVisibility}
        context={
          s.contextMap === null
            ? undefined
            : {
                map: s.contextMap,
                origin: contextLayout ? compositeOrigin(contextLayout.layout) : null,
                renderCanvas: (view, onViewChange) =>
                  canvasProps && contextLayout ? <MapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} /> : null,
                onExitRequest: s.requestExitContext,
              }
        }
      />
    );
    // The World view is hosted by MapEditingWorkspace at all times (one stable element and key), so the
    // WorldCanvas inside is never remounted when in-context editing turns the chrome on or off.
    return (
      <div className="app__map-editing" key="world-host">
        {contextLayout && defectsBanner}
        {contextLayout ? (
          <MapEditingWorkspace blockEditorSpec={blockEditorSpec} onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} mapName={contextLayout.map.name} data={contextLayout} editSession={editSession} editing={editing} renderCanvas={world} />
        ) : (
          <MapEditingWorkspace blockEditorSpec={blockEditorSpec} onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} active={false} mapName={selected} data={layout.data} editSession={editSession} editing={editing} renderCanvas={world} />
        )}
      </div>
    );
  };

  return {
    groups,
    session: editSession,
    leave,
    setSwitchError,
    onSelected: () => { setSwitchError(null); setHoveredMetatileId(null); },
    onEnterContext: () => {},
    visibility: { placed, error: visibilityError },
    hiddenMapTypes: HIDDEN_MAP_TYPES,
    dungeons,
    map: { error: layout.error, ready: Boolean(layout.data), name: layout.data?.map.name ?? null, defects: layout.brokenPath ? [brokenPathToDefect(layout.brokenPath)] : undefined },
    renderMap: (s) =>
      selected && layout.data ? (
        <div className="app__map-editing">
          {defectsBanner}
          <MapEditingWorkspace blockEditorSpec={blockEditorSpec} onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} mapName={selected} data={layout.data} editSession={editSession} editing={editing} />
        </div>
      ) : null,
    renderWorld,
    renderDungeon: (mapFilter, s) => (
      <WorldCanvas key="dungeon" mapFilter={mapFilter} tileVersions={s.tileVersions} onOpenMap={s.openMapFromWorld}
        onOpenWarpDestination={s.openWarpDestination}
        onPlacementsSaved={(names) => names.forEach(s.markManualPlacement)} />
    ),
    headerExtras: null,
    banners: switchError && (
      <div className="app__event-op-error" role="alert">
        <span>{switchError}</span>
        <button type="button" className="app__event-op-error-dismiss" onClick={() => setSwitchError(null)} aria-label="Dismiss">x</button>
      </div>
    ),
    /* Task 17: PokemonIndicatorDialog owns its own modal shell exactly like
       SaveDialog above (Step 10's own design correction) -- App.tsx
       just conditionally renders it as a sibling, same stacking-
       context reasoning as SaveDialog's own comment just above. */
    modals:
      editing.indicatorOpen && selected ? (
        <PokemonIndicatorDialog
          key={`${selected}:${editing.indicatorEdit?.index ?? "add"}`}
          mapName={selected}
          edit={editing.indicatorEdit}
          onDone={(scriptLabel, payload) => {
            if (!isIndicatorMapUpdate(payload) || payload.map.name !== selected) throw new Error("Invalid Indicator session response.");
            editSession.applyExternalMapUpdate(payload.map, payload.isDirty);
            editing.setIndicatorOpen(false);
            editing.setSignAddedMessage(`${editing.indicatorEdit ? "Updated" : "Placed"} Pok\u00e9mon Indicator: ${scriptLabel}`);
          }}
          onCancel={() => editing.setIndicatorOpen(false)}
        />
      ) : null,
    saveDialog: {
      open: editing.saveDialogOpen, setOpen: editing.setSaveDialogOpen,
      // A commit closes the server session and writes the map to disk, which can change the effective
      // metatile count (a block appended by the block editor's "Save as new"). Re-read the payload so
      // the canvas and palette show what is on disk, the same follow-up the GBC adapter does -- and
      // without it the palette falls back to the load-time count after the Discard that follows a
      // "save as new, then save", since Discard drops the session counts (MapEditingWorkspace's
      // `editSession.primaryCount ?? data.primaryCount`). The failure is surfaced like GBC's reload
      // failure, never thrown into the dialog.
      onCommitted: () => {
        setSaveToken((token) => token + 1);
        const committed = selected;
        layout.reload().catch((e: unknown) => { if (selectedNow.current === committed) setSwitchError(`Saved, but could not reload the map: ${errorMessage(e)}`); });
      },
    },
  };
}

const blockEditorSpec: BlockEditorSpec = {
  family: "gba", width: 2, layers: 2, squareControls: ["palette", "flip"],
  blockFields: [
    { key: "behavior", label: "Behavior", optionsKey: "behaviors" },
    { key: "layerType", label: "Layer type", optionsKey: "layerTypes" },
  ],
  modes: ["1x1", "2x2"],
};

export const gbaAdapter = {
  blockEditorSpec,
  addEventFields, addEventDefaults,
  family: "gba",
  label: null,
  capabilities: GBA_CAPABILITIES,
  useRuntime: useGbaRuntime,
} satisfies EngineAdapter;
