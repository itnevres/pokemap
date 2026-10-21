import { DefectsBanner } from "../shared/DefectsBanner.js";
import { useMapDefects } from "../hooks/useMapDefects.js";
import { useState } from "react";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../components/MapEditingWorkspace.js";
import { MapCanvas, compositeOrigin } from "../components/MapCanvas.js";
import { WorldCanvas } from "../components/WorldCanvas.js";
import { PokemonIndicatorDialog } from "../components/PokemonIndicatorDialog.js";
import { useMapGroups } from "../hooks/useMapGroups.js";
import { useMapLayout } from "../hooks/useMapLayout.js";
import { useWorldVisibility } from "../hooks/useWorldVisibility.js";
import { useDungeons } from "../hooks/useDungeons.js";
import { useEditSession, isIndicatorMapUpdate } from "../hooks/useEditSession.js";
import { useMapEditing } from "../hooks/useMapEditing.js";
import { HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { GBA_CAPABILITIES, type EngineAdapter, type FamilyRuntime, type RuntimeArgs, type ShellSlots } from "../shell/adapter.js";

/** The GBA-only half of the shell (was App.tsx): data hooks, edit session, map editing state, switch policy, canvases. */
export function useGbaRuntime({ selected, mode, requestPrompt }: RuntimeArgs): FamilyRuntime {
  const [saveToken, setSaveToken] = useState(0);
  const { defects, incomplete, error: defectsError } = useMapDefects(selected, saveToken);
  const defectsBanner = <DefectsBanner key={selected} defects={defects} incomplete={incomplete} error={defectsError} />;
  const groups = useMapGroups();
  const layout = useMapLayout(selected);
  // Known limitation, accepted for now (predates this task): this is a
  // snapshot taken once per World-mode entry, not a live subscription -- it
  // can go stale within the session after a drag or a jump-reveal on
  // WorldCanvas's own canvas. A full refresh currently requires leaving and
  // re-entering World mode.
  const { placed, error: visibilityError } = useWorldVisibility(mode === "world");
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
        tileVersions={s.tileVersions}
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
          <MapEditingWorkspace onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} mapName={contextLayout.map.name} data={contextLayout} editSession={editSession} editing={editing} renderCanvas={world} />
        ) : (
          <MapEditingWorkspace onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} active={false} mapName={selected} data={layout.data} editSession={editSession} editing={editing} renderCanvas={world} />
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
    map: { error: layout.error, ready: Boolean(layout.data) },
    renderMap: (s) =>
      selected && layout.data ? (
        <div className="app__map-editing">
          {defectsBanner}
          <MapEditingWorkspace onStrokeChain={s.onStrokeChain} hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId} mapName={selected} data={layout.data} editSession={editSession} editing={editing} />
        </div>
      ) : null,
    renderWorld,
    renderDungeon: (mapFilter, s) => <WorldCanvas key="dungeon" mapFilter={mapFilter} onOpenMap={s.openMapFromWorld} />,
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
    saveDialog: { open: editing.saveDialogOpen, setOpen: editing.setSaveDialogOpen, onCommitted: () => setSaveToken((token) => token + 1) },
  };
}

export const gbaAdapter: EngineAdapter = {
  family: "gba",
  label: null,
  capabilities: GBA_CAPABILITIES,
  useRuntime: useGbaRuntime,
};
