import { useMapLayout } from "../hooks/useMapLayout.js";
import { MapCanvas } from "./MapCanvas.js";

export interface WarpDestinationModalProps {
  mapName: string;
  onClose: () => void;
}

/**
 * Feature B's destination preview (spec §4.3): a real, interactive
 * MapCanvas for the warp's destination, not a static image -- MapCanvas
 * already does its own data fetching given just a map name (App.tsx's own
 * Map-mode usage), so this only needs the same useMapLayout hook App.tsx
 * already drives it with.
 *
 * Rendered by its caller (WorldCanvas) as a TOP-LEVEL sibling, never nested
 * inside `.world-canvas__body` or any other descendant with its own
 * stacking context -- Task 28's tooltip postmortem
 * (packages/ui/src/components/WorldCanvas.tsx) is the standing lesson
 * here: a modal buried inside a lower stacking context could never paint
 * above its siblings, however high its own z-index is set.
 */
export function WarpDestinationModal({ mapName, onClose }: WarpDestinationModalProps) {
  const { data, error } = useMapLayout(mapName);

  return (
    // Review fix: Escape here is defense-in-depth alongside the close
    // button's own autoFocus below -- once focus moves inside the modal on
    // mount, Escape at this level intercepts the key before it can bubble
    // to the underlying WorldCanvas's own onCanvasKeyDown (which clears the
    // map selection, not what an Escape while THIS modal is open should
    // do). Same plain `if (e.key === "Escape")` idiom SpeciesSpotlight.tsx
    // already uses for its own dropdown.
    <div
      className="warp-modal__backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* Review fix: role="dialog"/aria-modal/aria-label moved here, onto
          the actual dialog boundary -- the panel is what visually reads as
          "the dialog"; the backdrop is a full-viewport scrim behind it, not
          part of the dialog itself. */}
      <div className="warp-modal__panel" role="dialog" aria-modal="true" aria-label={`${mapName} preview`}>
        <div className="warp-modal__header">
          <span className="warp-modal__title">{mapName}</span>
          {/* Review fix: autoFocus moves keyboard focus into the modal on
              mount -- fixes both the tab-order problem (this button was
              previously the LAST tab stop after ~1,030 other elements) and
              the Escape misfire (with focus still on the underlying canvas,
              Escape reached WorldCanvas's own onCanvasKeyDown instead of
              this modal). */}
          <button type="button" className="warp-modal__close" onClick={onClose} aria-label="Close" autoFocus>
            ×
          </button>
        </div>
        <div className="warp-modal__body">
          {error ? (
            <p className="app__canvas-placeholder">Could not load {mapName}: {error}</p>
          ) : data ? (
            <MapCanvas mapName={mapName} data={data} />
          ) : (
            <p className="app__canvas-placeholder">Loading {mapName}…</p>
          )}
        </div>
      </div>
    </div>
  );
}
