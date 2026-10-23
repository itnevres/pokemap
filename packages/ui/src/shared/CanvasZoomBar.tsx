import type { Zoom } from "../components/mapView.js";

interface CanvasZoomBarProps {
  zoom: Zoom;
  zoomLevels: readonly Zoom[];
  applyZoom: (zoom: Zoom, pivotX: number, pivotY: number) => void;
  centerPivot: () => [number, number];
  fit: () => void;
}

export function CanvasZoomBar({ zoom, zoomLevels, applyZoom, centerPivot, fit }: CanvasZoomBarProps) {
  return <div className="map-canvas__zoom" role="group" aria-label="Zoom">
    {zoomLevels.map((z) => (
      <button key={z} type="button" className="map-canvas__btn" aria-pressed={zoom === z} onClick={() => applyZoom(z, ...centerPivot())}>
        {z}×
      </button>
    ))}
    <button type="button" className="map-canvas__btn" onClick={fit} title="Fit to screen (F)">
      Fit
    </button>
  </div>;
}
