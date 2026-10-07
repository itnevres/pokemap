import { useGbcMap } from "./hooks/useGbcMap.js";
import { GbcMapCanvas } from "./GbcMapCanvas.js";
import type { GbcTimeOfDay } from "./time.js";

export function GbcWarpDestinationModal({ mapName, time, onClose }: { mapName: string; time: GbcTimeOfDay; onClose: () => void }) {
  const { data, error } = useGbcMap(mapName);
  const ready = data?.map.name === mapName ? data : null;
  return <div className="warp-modal__backdrop" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="warp-modal__panel" role="dialog" aria-modal="true" aria-label={`${mapName} preview`}>
      <div className="warp-modal__header">
        <span className="warp-modal__title">{mapName}</span>
        <button type="button" className="warp-modal__close" onClick={onClose} aria-label="Close" autoFocus>×</button>
      </div>
      <div className="warp-modal__body">
        {error ? <p className="app__canvas-placeholder">Could not load {mapName}: {error}</p>
          : ready ? <GbcMapCanvas mapName={mapName} data={ready} time={time} />
          : <p className="app__canvas-placeholder">Loading {mapName}…</p>}
      </div>
    </div>
  </div>;
}
