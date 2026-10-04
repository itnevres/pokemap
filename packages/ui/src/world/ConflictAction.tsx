import { useLayoutEffect, useRef, useState } from "react";
import type { ConflictActionState } from "./useConflictAcceptance.js";

interface Size { w: number; h: number }
interface Point { x: number; y: number }

/** Keep the measured popup, including a small inset, within the canvas. */
export function clampConflictAction(pointer: Point, viewport: Size, popup: Size, inset = 8): Point {
  const xInset = Math.min(inset, Math.max(0, (viewport.w - popup.w) / 2));
  const yInset = Math.min(inset, Math.max(0, (viewport.h - popup.h) / 2));
  return {
    x: Math.min(Math.max(pointer.x, xInset), Math.max(xInset, viewport.w - popup.w - xInset)),
    y: Math.min(Math.max(pointer.y, yInset), Math.max(yInset, viewport.h - popup.h - yInset)),
  };
}

export function ConflictAction({ action, viewport, onSave }: { action: ConflictActionState | null; viewport: Size; onSave(): void }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!action || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    setPosition(clampConflictAction(action, viewport, { w: rect.width, h: rect.height }));
  }, [action, viewport.w, viewport.h]);
  if (!action) return null;
  return <div ref={popupRef} className="world-canvas__conflict-action" style={{ left: position.x, top: position.y }}>
    <button type="button" className="map-canvas__btn" onClick={onSave}>
      {action.accepted ? "Un-accept conflict" : "Accept conflict"}
    </button>
  </div>;
}
