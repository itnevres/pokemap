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
    <div className="warp-modal__backdrop" role="dialog" aria-modal="true" aria-label={`${mapName} preview`}>
      <div className="warp-modal__panel">
        <div className="warp-modal__header">
          <span className="warp-modal__title">{mapName}</span>
          <button type="button" className="warp-modal__close" onClick={onClose} aria-label="Close">
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
