/** Conflict-badge chrome shared by both world canvases: the legend's Conflict/Accepted items, the badge tooltip and
 *  the acceptance-error toast. Each family computes the tooltip text (its own copy) and owns the acceptance state. */
export function ConflictLegendItems() {
  return (
    <>
      <span className="world-canvas__legend-item">
        <i className="world-canvas__swatch world-canvas__swatch--conflict" /> Conflict
      </span>
      <span className="world-canvas__legend-item">
        <i className="world-canvas__swatch world-canvas__swatch--conflict world-canvas__swatch--accepted" /> Accepted
      </span>
    </>
  );
}

export function ConflictTooltip({ tooltip }: { tooltip: { x: number; y: number; text: string } | null }) {
  if (!tooltip) return null;
  return (
    <div className="world-canvas__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
      {tooltip.text}
    </div>
  );
}

export function ConflictErrorToast({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="world-canvas__toast" role="alert">
      <span className="world-canvas__toast-text">Could not update conflict: {error}</span>
      <button type="button" className="world-canvas__toast-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}
