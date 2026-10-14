import { trapDialogFocus } from "../components/dialogFocus.js";
import { useEffect, useRef, type ReactNode } from "react";
import { useGbcMap } from "./hooks/useGbcMap.js";
import { GbcMapCanvas } from "./GbcMapCanvas.js";
import type { GbcTimeOfDay } from "./time.js";

export function GbcWarpDestinationModal({ mapName, time, onClose, children, opener }: { mapName: string; time: GbcTimeOfDay; onClose: () => void; children?: ReactNode; opener?: HTMLElement | null }) {
  const openerRef = useRef(opener ?? document.activeElement as HTMLElement | null);
  useEffect(() => {
    const previous = openerRef.current;
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const { data, error } = useGbcMap(children === undefined ? mapName : null);
  const ready = data?.map.name === mapName ? data : null;
  return <div className="warp-modal__backdrop" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="warp-modal__panel" onKeyDown={trapDialogFocus} role="dialog" aria-modal="true" aria-label={`${mapName} preview`}>
      <div className="warp-modal__header">
        <span className="warp-modal__title">{mapName}</span>
        <button type="button" className="warp-modal__close" onClick={onClose} aria-label="Close" autoFocus>×</button>
      </div>
      <div className="warp-modal__body" style={children !== undefined ? { flexDirection: "column" } : undefined}>
        {children !== undefined ? children : error ? <p className="app__canvas-placeholder">Could not load {mapName}: {error}</p>
          : ready ? <GbcMapCanvas mapName={mapName} data={ready} time={time} />
          : <p className="app__canvas-placeholder">Loading {mapName}…</p>}
      </div>
    </div>
  </div>;
}
