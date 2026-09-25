import { useEffect, useState } from "react";
import type { EventKind } from "@pokemap/core/src/edit/events.js";
import "../styles.css";

/**
 * Grounded in Task 7's REAL event shapes (packages/core/src/load/maps.ts),
 * not the plan's own illustrative sketch -- two real differences worth
 * recording:
 *
 *  - `warp.destWarpId` is a STRING (WarpEvent.destWarpId), not a number --
 *    events.ts's own moveEvent/deleteEvent doc comment explains why: it's a
 *    positional index into another map's warp_events array, and the raw
 *    field is frequently a symbolic constant like `WARP_ID_NONE` rather than
 *    a numeric literal. A number input would either coerce that to NaN or
 *    silently reject it, so both `destMap` and `destWarpId` are read-only
 *    text below.
 *  - `coord`/`bg` events are genuinely open-ended (`CoordEvent`/`BgEvent`
 *    both declare `[k: string]: unknown` beyond a small x/y/elevation/type
 *    base) -- load/maps.ts's own parseMap passes them through RAW,
 *    snake_case and all (`coordEvents: r.coord_events ?? []`), unlike
 *    object/warp which get a real camelCase parse. So these two variants
 *    below carry an index signature instead of a fixed field list, and this
 *    component only ever reads the one field (`type`) real pokeemerald data
 *    actually uses to label them (`TRIGGER`/`WEATHER` for coord, `SIGN`/
 *    `HIDDEN_ITEM`/... for bg) -- never enumerating the rest.
 */
export type SelectedEvent =
  | { kind: "object"; index: number; x: number; y: number; elevation: number; graphicsId: string; movementType: string }
  | { kind: "warp"; index: number; x: number; y: number; elevation: number; destMap: string; destWarpId: string }
  | ({ kind: "coord"; index: number; x: number; y: number; elevation: number } & { [k: string]: unknown })
  | ({ kind: "bg"; index: number; x: number; y: number; elevation: number } & { [k: string]: unknown });

export interface EventInspectorProps {
  selected: SelectedEvent | null;
  /** `elevation` rides along with every commit alongside x/y -- core's
   *  `moveEvent` now persists all three as real jsonEdits (follow-up to
   *  Task 7), so this is a genuine write, not just local state. This
   *  component doesn't need to know or care, it just reports what the
   *  fields currently hold; App.tsx's own call site is what wires it
   *  through to the server. */
  onMove: (next: { kind: SelectedEvent["kind"]; index: number; x: number; y: number; elevation: number }) => void;
  /** Both return a Promise (App.tsx's own handlers resolve it after their
   *  own .then/.catch -- see that file's own doc comments -- so it never
   *  rejects) purely so this component can track in-flight state locally
   *  (see `pending` below) and disable the button for the duration,
   *  mirroring SaveDialog's own `saving` guard. Review fix: without this, a
   *  rapid double-click on Add Event computed the same stale `newIndex`
   *  twice (App.tsx reads `currentMap.objectEvents.length` synchronously
   *  before the first call's response has landed), silently selecting the
   *  wrong event once the second round trip resolved. */
  onDelete: (ref: { kind: SelectedEvent["kind"]; index: number }) => Promise<void>;
  onAdd: () => Promise<void>;
}

const KIND_LABEL: Record<EventKind, string> = { object: "Object", warp: "Warp", coord: "Coord", bg: "Bg" };

/** Best-effort identifying subtitle per kind -- purely informational, never
 *  a labelled form field (nothing here is asserted on by name in tests, and
 *  nothing here round-trips through onMove). */
function subtitleFor(e: SelectedEvent): string {
  if (e.kind === "object") return `${e.graphicsId} · ${e.movementType}`;
  if (e.kind === "warp") return `→ ${e.destMap} #${e.destWarpId}`;
  const type = typeof e.type === "string" ? e.type : "unknown type";
  return type;
}

/**
 * Side-panel companion to MapCanvas's event markers (Task 14) -- mirrors
 * CollisionPalette's own controlled shape (Task 12): selection lives in the
 * PARENT (App.tsx's own `selectedEvent` state, populated by MapCanvas's
 * onSelectEvent), and this component is a pure display+edit form over
 * whatever is currently selected there. It never fetches, never owns
 * selection itself.
 *
 * `draft` is local, uncommitted edit state -- typing in a field updates the
 * displayed value immediately without spamming the server on every
 * keystroke; only `onBlur` (or Enter) actually calls `onMove`. Resyncs from
 * `selected` whenever the PARENT'S reference changes (a new selection, or a
 * server round trip updating this same event's fields) -- App.tsx keeps
 * `selectedEvent` in real state (not recomputed inline every render), so
 * this effect does not fire on unrelated App re-renders and clobber an
 * in-progress, not-yet-blurred edit.
 */
export function EventInspector({ selected, onMove, onDelete, onAdd }: EventInspectorProps) {
  const [draft, setDraft] = useState(selected);
  useEffect(() => setDraft(selected), [selected]);
  // In-flight guard for Add/Delete -- see onAdd/onDelete's own doc comment
  // on EventInspectorProps. Not reset by the `selected`-resync effect
  // above: a delete's own success already clears `selected` (App.tsx sets
  // selectedEvent to null), which unmounts this branch entirely, and an
  // add's own success mounts a NEW `selected` before this handler's
  // `finally` has even run -- either way `pending` on the stale instance
  // is moot, no explicit reset needed.
  const [pending, setPending] = useState(false);

  // Promise.resolve(...) wraps the call, not just `.finally` on its result
  // directly: onAdd/onDelete are typed as returning Promise<void> (App.tsx's
  // real handlers always do), but defends a test double or future caller
  // that hands back a plain value instead of forgetting to wire one in --
  // Promise.resolve(undefined) is itself thenable, so `.finally` never
  // throws either way.
  const handleAdd = () => {
    setPending(true);
    Promise.resolve(onAdd()).finally(() => setPending(false));
  };

  if (!selected || !draft) {
    return (
      <div className="event-inspector event-inspector--empty">
        <p className="event-inspector__empty-text">No event selected.</p>
        <button type="button" className="map-canvas__btn event-inspector__add-btn" onClick={handleAdd} disabled={pending}>
          {pending ? "Adding…" : "Add Event"}
        </button>
      </div>
    );
  }

  const handleDelete = () => {
    setPending(true);
    Promise.resolve(onDelete({ kind: draft.kind, index: draft.index })).finally(() => setPending(false));
  };

  const commit = (over: Partial<{ x: number; y: number; elevation: number }> = {}) => {
    onMove({
      kind: draft.kind,
      index: draft.index,
      x: over.x ?? draft.x,
      y: over.y ?? draft.y,
      elevation: over.elevation ?? draft.elevation,
    });
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <div className="event-inspector">
      <h3 className="event-inspector__title">
        <span className={`event-inspector__kind-dot event-inspector__kind-dot--${draft.kind}`} aria-hidden="true" />
        {KIND_LABEL[draft.kind]} event #{draft.index}
      </h3>
      <p className="event-inspector__subtitle">{subtitleFor(draft)}</p>

      <label className="event-inspector__field">
        <span className="event-inspector__field-label">X</span>
        <input
          type="number"
          aria-label="X"
          className="event-inspector__input"
          value={draft.x}
          onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })}
          onBlur={() => commit()}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label className="event-inspector__field">
        <span className="event-inspector__field-label">Y</span>
        <input
          type="number"
          aria-label="Y"
          className="event-inspector__input"
          value={draft.y}
          onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })}
          onBlur={() => commit()}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label className="event-inspector__field">
        <span className="event-inspector__field-label">Elevation</span>
        <input
          type="number"
          aria-label="Elevation"
          className="event-inspector__input"
          value={draft.elevation}
          onChange={(e) => setDraft({ ...draft, elevation: Number(e.target.value) })}
          onBlur={() => commit()}
          onKeyDown={blurOnEnter}
        />
      </label>

      {draft.kind === "warp" && (
        <>
          {/* Read-only: retargeting a warp's destination is a heavier
              operation involving events.ts's own findWarpsTargetingByIndex
              renumber-warning machinery (Task 7/9) -- explicitly out of
              scope here, see this task's own report. destWarpId is a raw
              STRING field (see this file's own SelectedEvent doc comment
              above), so it is a text input, never a number one, even
              read-only -- a number input would misrepresent a symbolic
              value like WARP_ID_NONE. */}
          <label className="event-inspector__field">
            <span className="event-inspector__field-label">Dest Map</span>
            <input type="text" aria-label="Dest Map" className="event-inspector__input" value={draft.destMap} readOnly />
          </label>
          <label className="event-inspector__field">
            <span className="event-inspector__field-label">Dest Warp</span>
            <input type="text" aria-label="Dest Warp" className="event-inspector__input" value={draft.destWarpId} readOnly />
          </label>
        </>
      )}

      <div className="event-inspector__actions">
        <button type="button" className="map-canvas__btn event-inspector__delete-btn" onClick={handleDelete} disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
