import type { ConflictActionState } from "./useConflictAcceptance.js";

export function ConflictAction({ action, viewport, onSave }: { action: ConflictActionState | null; viewport: { w: number; h: number }; onSave(): void }) {
  if (!action) return null;
  const horizontal = action.x > viewport.w / 2 ? { right: Math.max(0, viewport.w - action.x) } : { left: Math.max(0, action.x) };
  const vertical = action.y > viewport.h / 2 ? { bottom: Math.max(0, viewport.h - action.y) } : { top: Math.max(0, action.y) };
  return <div className="world-canvas__conflict-action" style={{ ...horizontal, ...vertical }}>
    <button type="button" className="map-canvas__btn" onClick={onSave}>
      {action.accepted ? "Un-accept conflict" : "Accept conflict"}
    </button>
  </div>;
}
