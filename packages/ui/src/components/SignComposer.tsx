import { useEffect, useState } from "react";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import "../styles.css";

interface SignSpeciesSuggestion { species: string; percent: number; method: string; minLevel: number; maxLevel: number }
interface SignSuggestions { species: SignSpeciesSuggestion[]; placement: { x: number; y: number } | null }
interface Refusal { code: string; message: string; fix: string; subject: string }
interface SignAddSuccess { map: MapData; isDirty: boolean; scriptLabel: string }
interface RefusalResponse { refusals: Refusal[] }

/** Same "validate before trusting" posture as SaveDialog.tsx's own
 *  isDiffPlan -- both `GET /api/sign/:map/suggestions` and `POST
 *  /api/edit/:map/sign/add` normally answer a specific shape, but NOT
 *  always: a thrown error inside either route sends `{ error: string }`
 *  instead, with no `species`/`scriptLabel`/`refusals` at all. */
function isSignSuggestions(body: unknown): body is SignSuggestions {
  return !!body && typeof body === "object" && Array.isArray((body as { species?: unknown }).species);
}

function isSignAddSuccess(body: unknown): body is SignAddSuccess {
  return !!body && typeof body === "object" && typeof (body as { scriptLabel?: unknown }).scriptLabel === "string";
}

function isRefusalResponse(body: unknown): body is RefusalResponse {
  return !!body && typeof body === "object" && Array.isArray((body as { refusals?: unknown }).refusals);
}

/** Pulls a human message out of the `{ error: string }` shape a thrown
 *  server route sends, when present -- mirrors SaveDialog.tsx's own
 *  errorMessageFrom exactly. */
function errorMessageFrom(body: unknown): string | null {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return null;
}

export interface SignComposerProps {
  mapName: string;
  onAdded: (scriptLabel: string) => void;
  /** Optional: the server's own post-add `{ map, isDirty }` (identical
   *  shape to the `/event/*` routes' own EventOpResponse -- both are built
   *  by the same server-side `handleEventOp` helper), handed back so the
   *  caller can sync it into `useEditSession`'s own state (see that hook's
   *  `applyExternalMapUpdate` doc comment) without a second round trip.
   *  Not required by every caller/test -- `onAdded` alone is enough to know
   *  a sign was added and close this dialog. */
  onSessionUpdated?: (map: MapData, isDirty: boolean) => void;
  onCancel: () => void;
}

/**
 * Wild sign authoring flow -- ranks catchable species (Task 15's
 * `rankSpeciesForSign`), suggests a grass-adjacent placement
 * (`suggestSignPlacement`), and on submit calls Task 17's own `/sign/add`
 * route, which composes ONE object-event insert and ONE scripts.inc append
 * into the session's normal save plan. SaveDialog is still the only thing
 * that actually commits a session to disk (I6) -- this component only
 * stages the edit via the same in-memory EditSession every other edit
 * route uses.
 *
 * Owns its own modal shell (backdrop + Escape-to-cancel + autofocus),
 * mirroring SaveDialog.tsx's own established pattern exactly (itself
 * mirroring WarpDestinationModal's precedent) -- the caller (App.tsx) just
 * conditionally renders `<SignComposer>`, no wrapping backdrop of its own.
 */
export function SignComposer({ mapName, onAdded, onSessionUpdated, onCancel }: SignComposerProps) {
  const [suggestions, setSuggestions] = useState<SignSuggestions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState("");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [elevation] = useState(0);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sign/${encodeURIComponent(mapName)}/suggestions`)
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !isSignSuggestions(body)) {
          setLoadError(errorMessageFrom(body) ?? `Failed to load suggestions (status ${r.status}).`);
          return;
        }
        setSuggestions(body);
        if (body.placement) { setX(body.placement.x); setY(body.placement.y); }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load suggestions.");
      });
    return () => { cancelled = true; };
  }, [mapName]);

  const submit = async () => {
    if (!species || !dialogue.trim()) return;
    setSubmitting(true);
    setRefusals([]);
    setAddError(null);
    try {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/sign/add`, {
        method: "POST",
        body: JSON.stringify({ x, y, elevation, species, dialogue }),
      });
      const body: unknown = await r.json().catch(() => null);
      setSubmitting(false);
      if (r.ok && isSignAddSuccess(body)) {
        onSessionUpdated?.(body.map, body.isDirty);
        onAdded(body.scriptLabel);
        return;
      }
      if (isRefusalResponse(body)) {
        setRefusals(body.refusals);
        return;
      }
      // e.g. a genuine 500 -- the route's own catch sends { error }.
      setAddError(errorMessageFrom(body) ?? `Failed to add sign (status ${r.status}).`);
    } catch (e) {
      setSubmitting(false);
      setAddError(e instanceof Error ? e.message : "Failed to add sign.");
    }
  };

  return (
    <div
      className="warp-modal__backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {/* `warp-modal__panel` alongside `sign-composer`: reuses
          WarpDestinationModal's own panel chrome (bg-panel-raised/
          border-strong/radius), same as SaveDialog's own root className,
          rather than a second, independently-styled panel shape. */}
      <div className="sign-composer warp-modal__panel" role="dialog" aria-modal="true" aria-label="Add wild sign">
        <h2 className="sign-composer__title">Add Wild Sign</h2>
        {loadError ? (
          <p className="save-dialog__load-error">Could not load suggestions: {loadError}</p>
        ) : suggestions === null ? (
          <p className="save-dialog__loading">Loading suggestions…</p>
        ) : suggestions.species.length === 0 ? (
          <p className="save-dialog__empty">No wild encounters on this map to base a sign on.</p>
        ) : (
          <ul className="sign-composer__species-list">
            {suggestions.species.map((s) => (
              <li key={s.species}>
                <button
                  type="button"
                  className="map-canvas__btn sign-composer__species-btn"
                  aria-pressed={species === s.species}
                  onClick={() => setSpecies(s.species)}
                >
                  {`${s.species} — ${s.percent}%`}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sign-composer__coords">
          <label className="sign-composer__field">
            <span className="sign-composer__field-label">X</span>
            <input type="number" aria-label="X" className="sign-composer__input" value={x} onChange={(e) => setX(Number(e.target.value))} />
          </label>
          <label className="sign-composer__field">
            <span className="sign-composer__field-label">Y</span>
            <input type="number" aria-label="Y" className="sign-composer__input" value={y} onChange={(e) => setY(Number(e.target.value))} />
          </label>
        </div>
        <label className="sign-composer__field sign-composer__field--dialogue">
          <span className="sign-composer__field-label">Dialogue</span>
          <input type="text" aria-label="Dialogue" className="sign-composer__input" value={dialogue} onChange={(e) => setDialogue(e.target.value)} />
        </label>

        {addError && (
          <div className="sign-composer__refusal" role="alert">
            <p className="sign-composer__refusal-message">Could not add sign: {addError}</p>
          </div>
        )}
        {refusals.map((r) => (
          <div key={r.code + r.subject} className="sign-composer__refusal" role="alert">
            <p className="sign-composer__refusal-message">{r.message}</p>
            <p className="sign-composer__refusal-fix">{r.fix}</p>
          </div>
        ))}

        <div className="sign-composer__actions">
          <button type="button" className="map-canvas__btn" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="map-canvas__btn sign-composer__btn--primary"
            onClick={() => void submit()}
            disabled={submitting || !species || !dialogue.trim()}
          >
            {submitting ? "Adding…" : "Add Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
