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

/**
 * The ONLY UI path that turns an in-memory edit session (Task 8/9's
 * server-side EditSession) into a real disk write -- invariant I6, "no
 * autosave, ever." Nothing else in this app writes without the player
 * explicitly landing here and clicking Save Changes.
 *
 * Both `GET /api/edit/:map/plan` and `POST /api/edit/:map/commit` return
 * core's own `formatDiffJson(plan)` shape -- `{ changes, refusals }` -- see
 * packages/core/src/write/diff.ts and packages/server/src/index.ts's
 * planMatch/commitMatch handlers. This component never invents its own
 * response contract; it renders exactly what the server already sends.
 */
export function SaveDialog({ mapName, onCommitted, onCancel }: SaveDialogProps) {
  const [plan, setPlan] = useState<DiffPlan | null>(null);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/edit/${encodeURIComponent(mapName)}/plan`)
      .then((r) => r.json())
      .then((d: DiffPlan) => { if (!cancelled) setPlan(d); });
    return () => { cancelled = true; };
  }, [mapName]);

  const save = async () => {
    setSaving(true);
    setRefusals([]);
    const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/commit`, { method: "POST" });
    const body = (await r.json()) as DiffPlan;
    setSaving(false);
    if (r.ok && body.refusals.length === 0) {
      onCommitted();
      return;
    }
    // A refused commit still carries the server's own up-to-date plan
    // shape (see commitMatch's own `formatDiffJson(plan)` on the 400 path)
    // -- re-render the changes list from it too, not just the refusals, so
    // the dialog never goes stale relative to what the server just saw.
    setPlan(body);
    setRefusals(body.refusals);
  };

  const nothingToSave = plan !== null && plan.changes.length === 0;

  return (
    // `warp-modal__panel` alongside `save-dialog`: reuses WarpDestinationModal's
    // own panel chrome (bg-panel-raised/border-strong/radius, Task 8 Feature
    // B) for the dialog surface itself -- the caller (App.tsx) only supplies
    // the `.warp-modal__backdrop` scrim around this, rather than a second,
    // independently-styled panel shape.
    <div className="save-dialog warp-modal__panel" role="dialog" aria-modal="true" aria-label="Save changes">
      <h2 className="save-dialog__title">Save Changes</h2>
      {plan === null ? (
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
      {refusals.map((r) => (
        <div key={r.code + r.subject} className="save-dialog__refusal" role="alert">
          <p className="save-dialog__refusal-message">{r.message}</p>
          <p className="save-dialog__refusal-fix">{r.fix}</p>
        </div>
      ))}
      <div className="save-dialog__actions">
        <button type="button" className="map-canvas__btn" onClick={onCancel}>
          Discard
        </button>
        <button
          type="button"
          className="map-canvas__btn save-dialog__btn--primary"
          onClick={() => void save()}
          disabled={saving || plan === null || nothingToSave}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
