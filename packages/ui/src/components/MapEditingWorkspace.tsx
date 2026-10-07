import type { ReactNode } from "react";
import { MapCanvas, type MapCanvasProps } from "./MapCanvas.js";
import { Toolbar } from "./Toolbar.js";
import { CollisionPalette } from "./CollisionPalette.js";
import { MetatilePalette } from "./MetatilePalette.js";
import { EventInspector } from "./EventInspector.js";
import type { UseEditSessionResult } from "../hooks/useEditSession.js";
import type { MapLayoutData } from "../hooks/useMapLayout.js";
import type { useMapEditing } from "../hooks/useMapEditing.js";

/** The props the workspace builds for the canvas it hosts -- exactly what
 *  `App` passed to `MapCanvas` before the extraction (the controlled
 *  `view`/`onViewChange` pair is deliberately not part of this: a host that
 *  wants it adds it in its own `renderCanvas`). */
export type MapEditingCanvasProps = Pick<
  MapCanvasProps,
  "mapName" | "data" | "editSession" | "activeTool" | "onSelectEvent" | "selectedEventRef" | "onMoveEvent" | "onDropperPick"
>;

interface MapEditingWorkspaceBase {
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

/** Plan 6c E2: the map-editing chrome (toolbar, tool strips, event-op/sign
 *  banners, canvas + inspector) lifted verbatim out of `App.tsx`. State lives
 *  in `useMapEditing`; the edit session in `App`; `SaveDialog`/`SignComposer`
 *  stay siblings at `<main>` level in `App` for stacking reasons. */
export function MapEditingWorkspace({ active = true, mapName, data, editSession, editing, renderCanvas }: MapEditingWorkspaceProps) {
  const {
    activeToolKind, setActiveToolKind, collisionValue, setCollisionValue, currentStamp, setCurrentStamp,
    setSaveDialogOpen, setSignComposerOpen, signAddedMessage, setSignAddedMessage, eventOpError, setEventOpError,
    selectedEvent, activeTool, handleDiscard, onSelectEvent, onCanvasMoveEvent, onMoveEventFromInspector,
    onDeleteEvent, onAddEvent,
  } = editing;
  const canvasProps: MapEditingCanvasProps | null =
    mapName !== null && data !== null
      ? {
          mapName,
          data,
          editSession,
          activeTool,
          onSelectEvent,
          selectedEventRef: selectedEvent ? { kind: selectedEvent.kind, index: selectedEvent.index } : null,
          onMoveEvent: onCanvasMoveEvent,
          onDropperPick: setCurrentStamp,
        }
      : null;
  // Active, a map always exists (see ActiveMapEditingWorkspaceProps); inactive, the host's renderCanvas takes the null.
  const canvas = renderCanvas
    ? (renderCanvas as (p: MapEditingCanvasProps | null) => ReactNode)(canvasProps)
    : canvasProps && <MapCanvas {...canvasProps} />;
  return (
    <div className="app__map-editing">
      {active && <Toolbar
        activeToolKind={activeToolKind}
        onSelectTool={setActiveToolKind}
        isDirty={editSession.isDirty}
        onUndo={() => void editSession.undo()}
        onRedo={() => void editSession.redo()}
        canUndo={editSession.canUndo}
        canRedo={editSession.canRedo}
        onOpenSave={() => setSaveDialogOpen(true)}
        onDiscard={handleDiscard}
        onOpenSignComposer={() => setSignComposerOpen(true)}
        // Code-review fix: only tools actually wired to MapCanvas
        // may render enabled (see `activeTool`'s own doc comment in
        // useMapEditing.ts) -- everything else must render visibly disabled,
        // not clickable-but-silently-inert. All six tools are now
        // wired.
        availableTools={["collision", "pencil", "rect", "bucket", "dropper", "shift"]}
      />}
      {active && activeToolKind === "collision" && (
        <div className="app__collision-strip">
          <CollisionPalette selected={collisionValue} onSelect={setCollisionValue} />
        </div>
      )}
      {active && data && (activeToolKind === "pencil" || activeToolKind === "rect" || activeToolKind === "bucket") && (
        <div className="app__metatile-strip">
          <MetatilePalette
            layoutName={data.layout.name}
            split={data.split}
            primaryCount={data.primaryCount}
            secondaryCount={data.secondaryCount}
            onSelect={setCurrentStamp}
            selected={currentStamp}
          />
        </div>
      )}
      {/* Review fix: a failed move/add/delete used to be an
          unhandled rejection with zero visible signal -- reuses
          SaveDialog's own `.save-dialog__refusal`-style danger
          banner (role="alert", border-danger) rather than inventing
          a second error-surface convention. Dismissible so it
          doesn't linger forever after the player has seen it; also
          cleared automatically on the next successful event op. */}
      {active && eventOpError && (
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
      {active && signAddedMessage && (
        <div className="app__sign-added" role="status">
          <span>{signAddedMessage}</span>
          <button type="button" className="app__sign-added-dismiss" onClick={() => setSignAddedMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {/* Task 14: EventInspector docks as a real side panel next to
          the canvas (DESIGN.md's own layout section anticipates
          exactly this -- "whatever Task 21+ adds -- an inspector, a
          metatile palette"), not another horizontal strip like
          CollisionPalette above it -- its X/Y/Elevation/Delete form
          reads naturally as a vertical column, the same shape
          app__sidebar's own MapTree already uses on the opposite
          edge of the screen. Always mounted (not gated on a
          selection): EventInspector's own empty state carries the
          Add Event entry point. */}
      <div className="app__map-editing-body">
        {canvas}
        {active && <EventInspector selected={selectedEvent} onMove={onMoveEventFromInspector} onDelete={onDeleteEvent} onAdd={onAddEvent} />}
      </div>
    </div>
  );
}
