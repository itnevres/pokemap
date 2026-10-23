import type { ReactNode } from "react";

export function LegendBar({ children }: { children: ReactNode }) {
  return <div className="map-canvas__legend">{children}</div>;
}

export function EventsLegendItems() {
  return <>
    <span className="map-canvas__legend-item">
      <i className="map-canvas__swatch map-canvas__swatch--event-object" /> Object
    </span>
    <span className="map-canvas__legend-item">
      <i className="map-canvas__swatch map-canvas__swatch--event-warp" /> Warp
    </span>
    <span className="map-canvas__legend-item">
      <i className="map-canvas__swatch map-canvas__swatch--event-coord" /> Coord
    </span>
    <span className="map-canvas__legend-item">
      <i className="map-canvas__swatch map-canvas__swatch--event-bg" /> Bg
    </span>
  </>;
}

export function EncountersLegendItem({ error, empty, hint }: { error: string | null | undefined; empty: boolean; hint: string }) {
  return error ? (
    <span className="map-canvas__legend-item" role="alert">
      {error}
    </span>
  ) : (
    <span className="map-canvas__legend-item">
      {empty ? "Encounters: none on this map" : hint}
    </span>
  );
}
