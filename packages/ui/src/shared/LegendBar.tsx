import type { ReactNode } from "react";

export function LegendBar({ children }: { children: ReactNode }) {
  return <div className="map-canvas__legend">{children}</div>;
}
