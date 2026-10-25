import type { ReactNode } from "react";

export interface MapStatusItem {
  key: string;
  content: ReactNode;
  /** Additional classes on the existing status-item span (hover and empty-hover modifiers). */
  className?: string;
}

/** Families supply the readouts, including rich quadrant emphasis; the shared frame preserves their DOM. */
export function MapStatusStrip({ items }: { items: readonly MapStatusItem[] }) {
  return <div className="map-canvas__status">
    {items.map((item) => <span key={item.key} className={`map-canvas__status-item${item.className ? ` ${item.className}` : ""}`}>
      {item.content}
    </span>)}
  </div>;
}
