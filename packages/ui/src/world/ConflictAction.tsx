import type { ConflictActionState } from "./useConflictAcceptance.js";

export function ConflictAction({ action, onSave }: { action: ConflictActionState | null; onSave(): void }) {
  if (!action) return null;
  return <div className="world-canvas__conflict-action" style={{ left: action.x, top: action.y }}>
    <button type="button" className="map-canvas__btn" onClick={onSave}>
      {action.accepted ? "Un-accept conflict" : "Accept conflict"}
    </button>
  </div>;
}
