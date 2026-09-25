import { useEffect, useState } from "react";
import "../styles.css";

interface PendingChange { path: string; kind: "json" | "binary"; summary: string }
interface Refusal { code: string; message: string; fix: string; subject: string }
interface DiffPlan { changes: PendingChange[]; refusals: Refusal[] }

export interface SaveDialogProps {
  mapName: string;
  onCommitted: () => void;
  onCancel: () => void;
}

/** Both `GET /api/edit/:map/plan` and `POST /api/edit/:map/commit` normally
 *  return core's own `formatDiffJson(plan)` shape -- but NOT always: a
 *  thrown error inside either route (e.g. commitMatch's own try/catch
 *  around `commitSave`) sends `{ error: string }` instead, with no
 *  `changes`/`refusals` at all. Code-review fix: this component used to
 *  cast every response `as DiffPlan` unconditionally, so a 500 crashed the
 *  dialog with a bare TypeError (`body.refusals.length` on `undefined`) --
 *  exactly the failure path a "no autosave" flow most needs to surface
 *  reliably, not hide behind a crash. This guard is checked before ANY
 *  field of a response body is read. */
function isDiffPlan(body: unknown): body is DiffPlan {
  return (
    !!body && typeof body === "object" &&
    Array.isArray((body as { changes?: unknown }).changes) &&
    Array.isArray((body as { refusals?: unknown }).refusals)
  );
}

/** Pulls a human message out of the `{ error: string }` shape a thrown
 *  server route sends, when present. */
function errorMessageFrom(body: unknown): string | null {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return null;
}

/**
 * The ONLY UI path that turns an in-memory edit session (Task 8/9's
 * server-side EditSession) into a real disk write -- invariant I6, "no
 * autosave, ever." Nothing else in this app writes without the player
 * explicitly landing here and clicking Save Changes.
 *
 * Owns its own modal shell (backdrop + Escape-to-cancel + autofocus),
 * mirroring WarpDestinationModal's own established pattern exactly (that
 * component's own "Review fix" comment is the precedent: without focus
 * moving INTO the dialog on mount, a keyboard Escape never reaches this
 * component's onKeyDown at all -- it keeps bubbling from whatever element
 * opened the dialog instead, which sits outside this subtree). The caller
 * (App.tsx) just conditionally renders `<SaveDialog>` -- no wrapping
 * backdrop of its own.
 */
export function SaveDialog({ mapName, onCommitted, onCancel }: SaveDialogProps) {
  const [plan, setPlan] = useState<DiffPlan | null>(null);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/edit/${encodeURIComponent(mapName)}/plan`)
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !isDiffPlan(body)) {
          setLoadError(errorMessageFrom(body) ?? `Failed to load pending changes (status ${r.status}).`);
          return;
        }
        setPlan(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load pending changes.");
      });
    return () => { cancelled = true; };
  }, [mapName]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setRefusals([]);
    try {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/commit`, { method: "POST" });
      const body: unknown = await r.json().catch(() => null);
      setSaving(false);
      if (!isDiffPlan(body)) {
        // e.g. commitSave threw -- the route's own catch sends { error }.
        setSaveError(errorMessageFrom(body) ?? `Failed to save (status ${r.status}).`);
        return;
      }
      if (r.ok && body.refusals.length === 0) {
        onCommitted();
        return;
      }
      // A refused commit (400) still carries the server's own up-to-date
      // plan shape (see commitMatch's own `formatDiffJson(plan)` on that
      // path) -- re-render the changes list from it too, not just the
      // refusals, so the dialog never goes stale relative to what the
      // server just saw.
      setPlan(body);
      setRefusals(body.refusals);
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  const nothingToSave = plan !== null && plan.changes.length === 0;

  return (
    <div
      className="warp-modal__backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {/* `warp-modal__panel` alongside `save-dialog`: reuses
          WarpDestinationModal's own panel chrome (bg-panel-raised/
          border-strong/radius, Task 8 Feature B) for the dialog surface
          itself, rather than a second, independently-styled panel shape. */}
      <div className="save-dialog warp-modal__panel" role="dialog" aria-modal="true" aria-label="Save changes">
        <h2 className="save-dialog__title">Save Changes</h2>
        {loadError ? (
          <p className="save-dialog__load-error" role="alert">Could not load pending changes: {loadError}</p>
        ) : plan === null ? (
          <p className="save-dialog__loading">Loading changes…</p>
        ) : nothingToSave ? (
          <p className="save-dialog__empty">No changes to save.</p>
        ) : (
          <ul className="save-dialog__files">
            {plan.changes.map((c) => (
              <li key={c.path} className="save-dialog__file">
                <span className="save-dialog__file-summary">{c.summary}</span>
              </li>
            ))}
          </ul>
        )}
        {saveError && (
          <div className="save-dialog__refusal" role="alert">
            <p className="save-dialog__refusal-message">Could not save: {saveError}</p>
          </div>
        )}
        {refusals.map((r) => (
          <div key={r.code + r.subject} className="save-dialog__refusal" role="alert">
            <p className="save-dialog__refusal-message">{r.message}</p>
            <p className="save-dialog__refusal-fix">{r.fix}</p>
          </div>
        ))}
        <div className="save-dialog__actions">
          {/* autoFocus: see this component's own doc comment -- required
              for Escape (and a click on the backdrop's own onKeyDown path)
              to ever reach onCancel at all. Labelled "Cancel", not
              "Discard": this only closes the dialog client-side, keeping
              the edit session and any unsaved work fully intact -- ordinary,
              safe "not right now" semantics, the same as any app's Cancel
              button on a save prompt. A real discard/close-session mechanism
              now exists (POST /api/edit/:map/discard, editSessions.ts's own
              close()) -- but deliberately as its OWN, separately confirmed
              Toolbar action ("Discard Changes", App.tsx's own handleDiscard),
              not this button: repurposing Cancel to also discard would be a
              surprising regression (closing this dialog would silently throw
              away the player's work), not a fix. This button intentionally
              stays non-destructive. */}
          <button type="button" className="map-canvas__btn" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="map-canvas__btn save-dialog__btn--primary"
            onClick={() => void save()}
            disabled={saving || plan === null || nothingToSave || loadError !== null}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
