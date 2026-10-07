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
 * The unsaved-edits confirm. Deliberately owns NO backdrop and NO
 * `warp-modal__panel` (unlike `SaveDialog`, whose shell this otherwise
 * mirrors): `ProjectPicker` renders it inside its own body, and that body is
 * either the standalone `Root` page (which can never even hit a 409 -- no
 * current project means nothing dirty) or `ProjectSwitcher`'s modal panel.
 * The invariant is "at most one `.warp-modal__backdrop` / `aria-modal` in the
 * document", so the only shell is whichever the caller already supplied.
 *
 * `role="alertdialog"` (not `dialog`+`aria-modal`) because the enclosing
 * modal already is the one modal. `autoFocus` on Cancel + the root's own
 * Escape handler mirror `SaveDialog` (without focus inside, Escape never
 * reaches `onKeyDown` at all); `stopPropagation` keeps that Escape from also
 * reaching the enclosing switcher's backdrop, which would close the whole
 * switcher instead of just backing out of this confirm.
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
    <section
      className="hub-confirm"
      role="alertdialog"
      aria-label="Unsaved edits"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
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
    </section>
  );
}
