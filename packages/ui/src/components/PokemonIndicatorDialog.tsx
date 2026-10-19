import { useEffect, useRef, useState } from "react";
import type { IndicatorBlock, IndicatorSpecies } from "@pokemap/core/src/indicator/gba.js";
import "../styles.css";


interface IndicatorSuggestions { species: IndicatorSpecies[]; placement: { x: number; y: number } | null }
interface Refusal { code: string; message: string; fix: string; subject: string }
interface IndicatorSuccess { scriptLabel?: string; isDirty: boolean }
interface RefusalResponse { refusals: Refusal[] }

/** Same "validate before trusting" posture as SaveDialog.tsx's own
 *  isDiffPlan -- both `GET /api/indicator/:map/suggestions` and `POST
 *  /api/edit/:map/indicator/add` normally answer a specific shape, but NOT
 *  always: a thrown error inside either route sends `{ error: string }`
 *  instead, with no `species`/`scriptLabel`/`refusals` at all. */
function isIndicatorSuggestions(body: unknown): body is IndicatorSuggestions {
  if (!body || typeof body !== "object") return false;
  const b = body as IndicatorSuggestions;
  return Array.isArray(b.species) && b.species.every(s => s && typeof s.species === "string" && typeof s.name === "string" && Number.isFinite(s.percent))
    && (b.placement === null || (!!b.placement && Number.isFinite(b.placement.x) && Number.isFinite(b.placement.y)));
}

function isIndicatorSuccess(body: unknown): body is IndicatorSuccess {
  return !!body && typeof body === "object" && typeof (body as { isDirty?: unknown }).isDirty === "boolean"
    && (("map" in body && !!body.map && typeof body.map === "object")
      || ("events" in body && !!body.events && typeof body.events === "object" && "blocks" in body && Array.isArray(body.blocks)));
}

function isRefusalResponse(body: unknown): body is RefusalResponse {
  return !!body && typeof body === "object" && Array.isArray((body as RefusalResponse).refusals)
    && (body as RefusalResponse).refusals.length > 0 && (body as RefusalResponse).refusals.every(r => r && typeof r.code === "string" && typeof r.message === "string" && typeof r.fix === "string" && typeof r.subject === "string");
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

export interface PokemonIndicatorDialogProps {
  mapName: string;
  edit?: { index: number; block: IndicatorBlock };
  onDone: (scriptLabel: string, payload: unknown) => void;
  onCancel: () => void;
}

/**
 * Indicator authoring flow -- ranks catchable species, suggests a
 * grass-adjacent placement, and on submit calls the shared `/indicator/add`
 * route, which composes ONE object-event insert and ONE scripts.inc append
 * into the session's normal save plan. SaveDialog is still the only thing
 * that actually commits a session to disk (I6) -- this component only
 * stages the edit via the same in-memory EditSession every other edit
 * route uses.
 *
 * Owns its own modal shell (backdrop + Escape-to-cancel + autofocus),
 * mirroring SaveDialog.tsx's own established pattern exactly (itself
 * mirroring WarpDestinationModal's precedent) -- the caller (App.tsx) just
 * conditionally renders `<PokemonIndicatorDialog>`, no wrapping backdrop of its own.
 */
export function PokemonIndicatorDialog({ mapName, edit, onDone, onCancel }: PokemonIndicatorDialogProps) {
  const [suggestions, setSuggestions] = useState<IndicatorSuggestions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [species, setSpecies] = useState<string | null>(edit?.block.species ?? null);
  const [dialogue, setDialogue] = useState(edit?.block.text ?? "");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generation = useRef(0);
  const submitPending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    generation.current++;
    submitPending.current = false;
    setSuggestions(null);
    setLoadError(null);
    setSpecies(edit?.block.species ?? null);
    setDialogue(edit?.block.text ?? "");
    setX(0); setY(0);
    setRefusals([]); setAddError(null); setSubmitting(false);
    fetch(`/api/indicator/${encodeURIComponent(mapName)}/suggestions`)
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !isIndicatorSuggestions(body)) {
          if (isRefusalResponse(body)) {
            setRefusals(body.refusals);
            return;
          }
          setLoadError(errorMessageFrom(body) ?? `Failed to load suggestions (status ${r.status}).`);
          return;
        }
        setSuggestions(body);
        if (body.placement) { setX(body.placement.x); setY(body.placement.y); }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load suggestions.");
      });
    return () => { cancelled = true; generation.current++; };
  }, [mapName, edit?.index, edit?.block]);

  const submit = async () => {
    if (submitPending.current || !species || !dialogue.trim()) return;
    submitPending.current = true;
    const ticket = generation.current;
    setSubmitting(true);
    setRefusals([]);
    setAddError(null);
    try {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/indicator/${edit ? "update" : "add"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { index: edit.index, scriptLabel: edit.block.scriptLabel, species, text: dialogue } : { x, y, species, text: dialogue }),
      });
      const body: unknown = await r.json().catch(() => null);
      if (ticket !== generation.current) return;
      submitPending.current = false;
      setSubmitting(false);
      if (r.ok && isIndicatorSuccess(body) && (edit || typeof body.scriptLabel === "string")) {
        onDone(edit?.block.scriptLabel ?? body.scriptLabel!, body);
        return;
      }
      if (isRefusalResponse(body)) {
        setRefusals(body.refusals);
        return;
      }
      // e.g. a genuine 500 -- the route's own catch sends { error }.
      setAddError(errorMessageFrom(body) ?? `Failed to stage Indicator (status ${r.status}).`);
    } catch (e) {
      if (ticket !== generation.current) return;
      submitPending.current = false;
      setSubmitting(false);
      setAddError(e instanceof Error ? e.message : "Failed to stage Indicator.");
    }
  };

  return (
    <div
      className="warp-modal__backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitPending.current) onCancel();
      }}
    >
      {/* `warp-modal__panel` alongside `sign-composer`: reuses
          WarpDestinationModal's own panel chrome (bg-panel-raised/
          border-strong/radius), same as SaveDialog's own root className,
          rather than a second, independently-styled panel shape. */}
      <div className="sign-composer warp-modal__panel" role="dialog" aria-modal="true" aria-label={"Pok\u00e9mon Indicator"}>
        <h2 className="sign-composer__title">{"Pok\u00e9mon Indicator"}</h2>
        {loadError ? (
          <p className="save-dialog__load-error">Could not load suggestions: {loadError}</p>
        ) : suggestions === null ? (
          refusals.length === 0 && <p className="save-dialog__loading">Loading suggestions…</p>
        ) : suggestions.species.length === 0 ? (
          <p className="save-dialog__empty">No wild encounters on this map to base an Indicator on.</p>
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
                  {`${s.name} \u2014 ${s.percent}%`}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!edit && <div className="sign-composer__coords">
          <label className="sign-composer__field">
            <span className="sign-composer__field-label">X</span>
            <input type="number" aria-label="X" className="sign-composer__input" value={x} onChange={(e) => setX(Number(e.target.value))} />
          </label>
          <label className="sign-composer__field">
            <span className="sign-composer__field-label">Y</span>
            <input type="number" aria-label="Y" className="sign-composer__input" value={y} onChange={(e) => setY(Number(e.target.value))} />
          </label>
        </div>}
        <label className="sign-composer__field sign-composer__field--dialogue">
          <span className="sign-composer__field-label">Dialogue</span>
          <textarea rows={1} aria-label="Dialogue" className="sign-composer__input" value={dialogue} onChange={(e) => setDialogue(e.target.value)} />
        </label>

        {addError && (
          <div className="sign-composer__refusal" role="alert">
            <p className="sign-composer__refusal-message">Could not place Indicator: {addError}</p>
          </div>
        )}
        {refusals.map((r) => (
          <div key={r.code + r.subject} className="sign-composer__refusal" role="alert">
            <p className="sign-composer__refusal-message">Could not place Indicator: {r.message}</p>
            <p className="sign-composer__refusal-subject">{r.subject}</p>
            <p className="sign-composer__refusal-fix">{r.fix}</p>
          </div>
        ))}

        <div className="sign-composer__actions">
          <button type="button" className="map-canvas__btn" onClick={onCancel} disabled={submitting} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="map-canvas__btn sign-composer__btn--primary"
            onClick={() => void submit()}
            disabled={submitting || !species || !dialogue.trim()}
          >
            {submitting ? "Staging..." : edit ? "Update" : "Place"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reject malformed hub data before either inspector renders it. */
function isIndicatorBlock(body: unknown): body is IndicatorBlock {
  if (!body || typeof body !== "object") return false;
  const b = body as IndicatorBlock;
  return typeof b.scriptLabel === "string" && typeof b.textLabel === "string"
    && typeof b.species === "string" && typeof b.text === "string" && typeof b.editable === "boolean"
    && (b.reason === undefined || typeof b.reason === "string");
}

/** Each selection/source revision owns its lookup; cleanup retires late success AND error replies. */
export function useIndicatorBlock(mapName: string | undefined, index: number | undefined, source: unknown) {
  const [result, setResult] = useState<{ mapName: string; index: number; source: unknown; block: IndicatorBlock | null; error: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!mapName || index === undefined) return;
    const publish = (block: IndicatorBlock | null, error: string | null) => {
      if (!cancelled) setResult({ mapName, index, source, block, error });
    };
    fetch(`/api/edit/${encodeURIComponent(mapName)}/indicator/at?index=${index}`)
      .then(async r => {
        const body: unknown = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !body || typeof body !== "object" || !("indicator" in body)
          || (body.indicator !== null && !isIndicatorBlock(body.indicator))) {
          publish(null, errorMessageFrom(body) ?? "Could not load Indicator: unexpected response.");
          return;
        }
        publish(body.indicator, null);
      })
      .catch((e: unknown) => publish(null, e instanceof Error ? e.message : "Could not load Indicator."));
    return () => { cancelled = true; };
  }, [mapName, index, source]);
  // Never expose the previous selection even in the render before its effect's cleanup.
  return result !== null && result.mapName === mapName && result.index === index && result.source === source
    ? { block: result.block, error: result.error } : { block: null, error: null };
}
