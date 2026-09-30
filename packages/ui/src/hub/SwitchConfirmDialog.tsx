import { useState } from "react";
import "../styles.css";

export interface SwitchConfirmDialogProps {
  dirtyMaps: string[];
  onCancel: () => void;
  /** Performs the forced open. Resolves to an error message on failure, or
   *  `null` on success -- the caller (`ProjectPicker`) is the one that
   *  actually calls `onOpened`/closes on success, so this dialog only ever
   *  needs to know "did it work" to manage its own submitting/error state,
   *  never the resulting `ProjectInfo` itself. */
  onConfirm: () => Promise<string | null>;
}

/**
 * Mirrors `SaveDialog.tsx`'s own modal shell exactly (backdrop + Escape ->
 * onCancel + autoFocus on the safe button) -- see that component's own doc
 * comment for why focus must move INTO the dialog on mount for Escape to
 * ever reach this component's `onKeyDown` at all. Rendered by
 * `ProjectPicker` in place of its own body on a 409 conflict, never stacked
 * alongside it.
 */
export function SwitchConfirmDialog({ dirtyMaps, onCancel, onConfirm }: SwitchConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setSubmitting(true);
    setError(null);
    onConfirm().then((err) => {
      setSubmitting(false);
      if (err) setError(err);
    });
  };

  return (
    <div
      className="warp-modal__backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="warp-modal__panel hub-confirm" role="dialog" aria-modal="true" aria-label="Unsaved edits">
        <h2 className="hub-confirm__title">Unsaved edits</h2>
        <p className="hub-confirm__message">
          {dirtyMaps.length} map(s) have unsaved edits. Switching discards them.
        </p>
        <ul className="hub-confirm__list">
          {dirtyMaps.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {error && (
          <p className="hub-confirm__error" role="alert">
            {error}
          </p>
        )}
        <div className="hub-confirm__actions">
          {/* autoFocus: required for Escape to reach onKeyDown above, same
              as SaveDialog's own Cancel button. */}
          <button type="button" className="map-canvas__btn" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="map-canvas__btn hub-confirm__btn--danger"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Switching…" : "Discard and switch"}
          </button>
        </div>
      </div>
    </div>
  );
}
