export interface SwitchPromptDialogProps {
  mapName: string;
  busy: boolean;
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
}

export function SwitchPromptDialog({ mapName, busy, onSave, onDiscard, onCancel }: SwitchPromptDialogProps) {
  return (
    <div className="warp-modal__backdrop" onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (!busy) onCancel(); }
    }}>
      <div className="save-dialog warp-modal__panel" role="dialog" aria-modal="true" aria-label="Unsaved changes">
        <p>You have unsaved changes on {mapName}.</p>
        <div className="save-dialog__actions">
          <button type="button" className="map-canvas__btn" disabled={busy} onClick={onSave}>Save</button>
          <button type="button" className="map-canvas__btn" disabled={busy} onClick={onDiscard}>Discard</button>
          <button type="button" className="map-canvas__btn" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
