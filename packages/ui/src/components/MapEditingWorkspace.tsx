import { useState, type ReactNode } from "react";
import { MapCanvas, type MapCanvasProps } from "./MapCanvas.js";
import { Toolbar } from "./Toolbar.js";
import { CollisionPalette } from "./CollisionPalette.js";
import { MetatilePalette } from "./MetatilePalette.js";
import { EventInspector } from "./EventInspector.js";
import type { UseEditSessionResult } from "../hooks/useEditSession.js";
import type { MapLayoutData } from "../hooks/useMapLayout.js";
import { eventOpErrorMessage, type useMapEditing } from "../hooks/useMapEditing.js";
import { EditingWorkspace } from "../shared/EditingWorkspace.js";
import { GBA_CAPABILITIES, toolsFor } from "../shell/adapter.js";
import { SignEditor } from "../shared/SignEditor.js";
import { MAX_OBJECT_EVENTS, duplicateEventValue } from "../gba/duplicateEvent.js";

/** The props the workspace builds for the canvas it hosts -- exactly what
 *  `App` passed to `MapCanvas` before the extraction (the controlled
 *  `view`/`onViewChange` pair is deliberately not part of this: a host that
 *  wants it adds it in its own `renderCanvas`). */
export type MapEditingCanvasProps = Pick<
  MapCanvasProps,
  "onStrokeChain" | "mapName" | "data" | "editSession" | "activeTool" | "onSignPick" | "onSelectEvent" | "selectedEventRef" | "onMoveEvent" | "onDropperPick" | "onHoverMetatile"
>;

interface MapEditingWorkspaceBase {
  onStrokeChain?: MapCanvasProps["onStrokeChain"];
  hoveredMetatileId?: number | null;
  onHoverMetatile?: (id: number | null) => void;
  editSession: UseEditSessionResult;
  editing: ReturnType<typeof useMapEditing>;
}

/** Map mode: the chrome is on and there is always a map. `renderCanvas` is the seam for a second host (the
 *  Plan 6c E4 World view): it receives the canvas props built from `editing` and its output is rendered inside
 *  `.app__map-editing-body`, before `EventInspector`. Omitted: renders `<MapCanvas {...canvasProps} />`, the
 *  original Map-mode behaviour. */
interface ActiveMapEditingWorkspaceProps extends MapEditingWorkspaceBase {
  active?: true;
  mapName: string;
  data: MapLayoutData;
  renderCanvas?: (canvasProps: MapEditingCanvasProps) => ReactNode;
}

/** Plan 6c E4: `active={false}` renders only the wrapper and `.app__map-editing-body` holding the canvas slot (no
 *  Toolbar, strips, banners or EventInspector). The slot keeps its position either way, so the host's canvas is not
 *  remounted when the chrome switches on. There may be no map yet (`data` null); `renderCanvas` then receives null. */
interface InactiveMapEditingWorkspaceProps extends MapEditingWorkspaceBase {
  active: false;
  mapName: string | null;
  data: MapLayoutData | null;
  renderCanvas: (canvasProps: MapEditingCanvasProps | null) => ReactNode;
}

export type MapEditingWorkspaceProps = ActiveMapEditingWorkspaceProps | InactiveMapEditingWorkspaceProps;

/** Plan 6c E2: the map-editing chrome (toolbar, banners, canvas + rail)
 *  lifted verbatim out of `App.tsx`. State lives
 *  in `useMapEditing`; the edit session in `App`; `SaveDialog`/`PokemonIndicatorDialog`
 *  stay siblings at `<main>` level in `App` for stacking reasons. */
export function MapEditingWorkspace({ active = true, mapName, data, editSession, editing, renderCanvas, onStrokeChain, hoveredMetatileId, onHoverMetatile }: MapEditingWorkspaceProps) {
  const [signPick, setSignPick] = useState<{ x: number; y: number; anchor: DOMRect } | null>(null);
  const {
    activeToolKind, setActiveToolKind, collisionValue, setCollisionValue, currentStamp, setCurrentStamp,
    setSaveDialogOpen, setIndicatorOpen, signAddedMessage, setSignAddedMessage, eventOpError, setEventOpError,
    selectedEvent, currentMap, activeTool, handleDiscard, onSelectEvent, onCanvasMoveEvent, onMoveEventFromInspector,
    onDeleteEvent, onAddEvent, isVisitCurrent,
  } = editing;
  // Duplicate reads the FULL event from the session map (the inspector's selection is partial), see duplicateEventValue.
  const duplicateKey = { object: "objectEvents", warp: "warpEvents", coord: "coordEvents", bg: "bgEvents" } as const;
  const onDuplicate = (): Promise<void> => {
    const full = selectedEvent && currentMap ? currentMap[duplicateKey[selectedEvent.kind]][selectedEvent.index] : undefined;
    if (!selectedEvent || !full || !data) return Promise.resolve();
    const value = duplicateEventValue(selectedEvent.kind, full as unknown as Record<string, unknown>, data.layout.width, data.layout.height);
    return editSession.addEvent(selectedEvent.kind, value)
      .then(() => { if (isVisitCurrent()) setEventOpError(null); })
      .catch((e: unknown) => { if (isVisitCurrent()) setEventOpError(eventOpErrorMessage(e)); });
  };
  const duplicateDisabledReason = selectedEvent?.kind === "object" && (currentMap?.objectEvents.length ?? 0) >= MAX_OBJECT_EVENTS
    ? `The map already has ${MAX_OBJECT_EVENTS} object events` : undefined;
  const canvasProps: MapEditingCanvasProps | null =
    mapName !== null && data !== null
      ? {
          ...(onStrokeChain ? { onStrokeChain } : {}),
          ...(onHoverMetatile ? { onHoverMetatile } : {}),
          mapName,
          data,
          editSession,
          activeTool,
          onSelectEvent,
          selectedEventRef: selectedEvent ? { kind: selectedEvent.kind, index: selectedEvent.index } : null,
          onMoveEvent: onCanvasMoveEvent,
          onDropperPick: setCurrentStamp,
          onSignPick: (x, y, anchor) => setSignPick({ x, y, anchor }),
        }
      : null;
  const top = (
    <>
      <Toolbar
        activeToolKind={activeToolKind}
        onSelectTool={setActiveToolKind}
        isDirty={editSession.isDirty}
        onUndo={() => void editSession.undo()}
        onRedo={() => void editSession.redo()}
        canUndo={editSession.canUndo}
        canRedo={editSession.canRedo}
        onOpenSave={() => setSaveDialogOpen(true)}
        onDiscard={handleDiscard}
        // Code-review fix: only tools actually wired to MapCanvas
        // may render enabled (see `activeTool`'s own doc comment in
        // useMapEditing.ts) -- everything else must render visibly disabled,
        // not clickable-but-silently-inert. All six tools are now
        // wired.
        tools={toolsFor(GBA_CAPABILITIES)}
        availableTools={toolsFor(GBA_CAPABILITIES)}
        onOpenIndicator={GBA_CAPABILITIES.pokemonIndicator ? () => { editing.setIndicatorEdit(undefined); setIndicatorOpen(true); } : undefined}
      />
      {/* Review fix: a failed move/add/delete used to be an
          unhandled rejection with zero visible signal -- reuses
          SaveDialog's own `.save-dialog__refusal`-style danger
          banner (role="alert", border-danger) rather than inventing
          a second error-surface convention. Dismissible so it
          doesn't linger forever after the player has seen it; also
          cleared automatically on the next successful event op. */}
      {eventOpError && (
        <div className="app__event-op-error" role="alert">
          <span>{eventOpError}</span>
          <button type="button" className="app__event-op-error-dismiss" onClick={() => setEventOpError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {/* Task 17: one-shot confirmation after a successful sign add
          -- same dismissible-banner shape as eventOpError just
          above, accent-toned (not danger) since this reports a
          success, not a failure. role="status" (not "alert"): this
          is informational, not urgent, matching the semantic
          distinction between the two ARIA live-region roles. */}
      {signAddedMessage && (
        <div className="app__sign-added" role="status">
          <span>{signAddedMessage}</span>
          <button type="button" className="app__sign-added-dismiss" onClick={() => setSignAddedMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </>
  );
  /* Plan 9 (D4): one right-hand rail, as GBC has had since Plan 7 -- the collision palette while the Collision tool
     is active, the metatile palette always (a pick with another tool active only sets the stamp, as a dropper pick
     does), then EventInspector (always mounted: its empty state carries Add Event). */
  const side = (
    <>
      {activeToolKind === "collision" && <CollisionPalette selected={collisionValue} onSelect={setCollisionValue} />}
      {data && (
        <MetatilePalette
          layoutName={data.layout.name}
          split={data.split}
          primaryCount={data.primaryCount}
          secondaryCount={data.secondaryCount}
          onSelect={setCurrentStamp}
          selected={currentStamp}
          highlightId={hoveredMetatileId ?? null}
        />
      )}
      <EventInspector indicatorSource={currentMap} mapName={mapName ?? undefined} onEditIndicator={(edit) => { editing.setIndicatorEdit(edit); setIndicatorOpen(true); }} selected={selectedEvent} onMove={onMoveEventFromInspector} onDelete={onDeleteEvent} onAdd={onAddEvent} onDuplicate={onDuplicate} duplicateDisabledReason={duplicateDisabledReason} />
    </>
  );
  return (
    <div className="app__map-editing">
      <EditingWorkspace
        active={active}
        top={top}
        side={side}
        canvasProps={canvasProps}
        Canvas={MapCanvas}
        renderCanvas={renderCanvas as ((p: MapEditingCanvasProps | null) => ReactNode) | undefined}
      />
      {signPick && mapName && <SignEditor mapName={mapName} x={signPick.x} y={signPick.y} anchor={signPick.anchor}
        hasObjectEvent={currentMap?.objectEvents.some((event) => event.x === signPick.x && event.y === signPick.y) ?? false}
        onCancel={() => setSignPick(null)} onDone={() => setSignPick(null)}
        onSessionUpdated={(body) => {
          if (body && typeof body === "object" && "map" in body && "isDirty" in body) {
            editSession.applyExternalMapUpdate((body as { map: Parameters<typeof editSession.applyExternalMapUpdate>[0] }).map, Boolean((body as { isDirty: unknown }).isDirty));
          }
        }} />}
    </div>
  );
}
