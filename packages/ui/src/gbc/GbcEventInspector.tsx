import { useEffect, useState } from "react";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcEventKind, GbcWarpRenumberWarning } from "@pokemap/core/src/gbc/edit/events.js";
import type { GbcEventRef } from "./GbcMapCanvas.js";
import "../styles.css";

type AnyEvent = GbcMapEvents["warps"][number] | GbcMapEvents["coords"][number] | GbcMapEvents["bgs"][number] | GbcMapEvents["objects"][number];

const KIND_LABEL: Record<GbcEventKind, string> = { object: "Object", warp: "Warp", coord: "Coord", bg: "Bg" };

function lookup(events: GbcMapEvents, ref: GbcEventRef | null): AnyEvent | null {
  if (!ref) return null;
  const list = ref.kind === "object" ? events.objects : ref.kind === "warp" ? events.warps : ref.kind === "coord" ? events.coords : events.bgs;
  return list[ref.index] ?? null;
}

function subtitleFor(kind: GbcEventKind, e: AnyEvent): string {
  if (kind === "warp") { const w = e as GbcMapEvents["warps"][number]; return `→ ${w.mapConst} #${w.destWarp}`; }
  if (kind === "object") return (e as GbcMapEvents["objects"][number]).sprite;
  if (kind === "coord") { const c = e as GbcMapEvents["coords"][number]; return `${c.sceneConst} · ${c.script}`; }
  const b = e as GbcMapEvents["bgs"][number];
  return `${b.bgEventType} · ${b.script}`;
}

/**
 * The event's macro arguments as source text, in macro order (`gbc/edit/events.ts` `KINDS`), placed at
 * `(x+1, y)` clamped to the `stepsW x stepsH` step grid. Rebuilding from the event's own fields means every script
 * label and const the line mentions already exists, so a duplicate cannot break the build. Numeric fields come
 * back as decimal (a `$2` radius reads `2`), which assembles identically.
 */
export function duplicateArgs(kind: GbcEventKind, e: AnyEvent, stepsW: number, stepsH: number): string[] {
  // Right of the source; at the right edge, left of it instead, so a copy never sits exactly on its original.
  const x = String(Math.max(0, e.x + 1 <= stepsW - 1 ? e.x + 1 : e.x - 1));
  const y = String(Math.max(0, Math.min(stepsH - 1, e.y)));
  if (kind === "warp") { const w = e as GbcMapEvents["warps"][number]; return [x, y, w.mapConst, String(w.destWarp)]; }
  if (kind === "coord") { const c = e as GbcMapEvents["coords"][number]; return [x, y, c.sceneConst, c.script]; }
  if (kind === "bg") { const b = e as GbcMapEvents["bgs"][number]; return [x, y, b.bgEventType, b.script]; }
  const o = e as GbcMapEvents["objects"][number];
  return [x, y, o.sprite, o.moveData, String(o.radiusX), String(o.radiusY), o.hour1, o.hour2, o.palette, o.objectType, String(o.sightRange), o.script, o.eventFlag];
}

export interface GbcEventInspectorProps {
  events: GbcMapEvents;
  selected: GbcEventRef | null;
  stepsW: number;
  stepsH: number;
  /** Coordinates are STEPS (16 px). */
  onMove: (next: { kind: GbcEventKind; index: number; x: number; y: number }) => void;
  /** Both never reject (the host turns a failure into its error banner); the promise only drives `pending`. */
  onDelete: (ref: GbcEventRef) => Promise<void>;
  onDuplicate: (kind: GbcEventKind, args: string[]) => Promise<void>;
  warnings: GbcWarpRenumberWarning[];
  onDismissWarnings: () => void;
}

/**
 * Side panel for the selected GBC event; reuses `EventInspector`'s classes and layout (`components/
 * EventInspector.tsx`) but not its GBA-typed props. `draft` is uncommitted edit state: typing does not hit the
 * server, only blur/Enter does, and only when the value actually changed. It resyncs from the event's primitive
 * x/y (not the events object, which is a fresh reference on every server response and would clobber a
 * half-typed edit). `pending` disables Delete/Duplicate while one is in flight -- the GBA double-click-Add fix.
 *
 * Add is "Duplicate" only: scripts address objects by position, so a from-scratch event needs a script label
 * that exists, which only the CLI (`pokemap event add`) can author safely.
 */
export function GbcEventInspector({ events, selected, stepsW, stepsH, onMove, onDelete, onDuplicate, warnings, onDismissWarnings }: GbcEventInspectorProps) {
  const ev = lookup(events, selected);
  // Strings, parsed on commit: a controlled number input fed NaN (a cleared field) logs a React warning.
  const [draft, setDraft] = useState({ x: String(ev?.x ?? 0), y: String(ev?.y ?? 0) });
  useEffect(() => setDraft({ x: String(ev?.x ?? 0), y: String(ev?.y ?? 0) }), [selected?.kind, selected?.index, ev?.x, ev?.y]);
  const [pending, setPending] = useState<"delete" | "duplicate" | null>(null);
  const run = (what: "delete" | "duplicate", p: Promise<void>) => {
    setPending(what);
    Promise.resolve(p).finally(() => setPending(null));
  };

  const warningsBlock = warnings.length > 0 && (
    <div className="event-inspector__warnings" role="status">
      <div className="event-inspector__warnings-head">
        <span>Deleting this warp renumbered the warps after it. These warps now point at the wrong one:</span>
        <button type="button" className="app__event-op-error-dismiss" aria-label="Dismiss warnings" onClick={onDismissWarnings}>×</button>
      </div>
      <ul className="event-inspector__warnings-list">
        {warnings.map((w) => <li key={`${w.fromMap}:${w.warpIndex}`}>{w.fromMap} warp[{w.warpIndex}] → {w.destWarp}</li>)}
      </ul>
    </div>
  );

  if (!selected || !ev) {
    return (
      <div className="event-inspector event-inspector--empty">
        {warningsBlock}
        <p className="event-inspector__empty-text">
          Select an event to duplicate it. To add one from scratch, use <code>pokemap event add</code>.
        </p>
        <button type="button" className="map-canvas__btn event-inspector__add-btn" disabled>Duplicate</button>
      </div>
    );
  }

  const commit = () => {
    const x = draft.x.trim() === "" ? NaN : Number(draft.x);
    const y = draft.y.trim() === "" ? NaN : Number(draft.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      setDraft({ x: String(ev.x), y: String(ev.y) }); // empty or fractional: show the real position again
      return;
    }
    if (x === ev.x && y === ev.y) return;
    onMove({ kind: selected.kind, index: selected.index, x, y });
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <div className="event-inspector">
      {warningsBlock}
      <h3 className="event-inspector__title">
        <span className={`event-inspector__kind-dot event-inspector__kind-dot--${selected.kind}`} aria-hidden="true" />
        {KIND_LABEL[selected.kind]} event #{selected.index}
      </h3>
      <p className="event-inspector__subtitle">{subtitleFor(selected.kind, ev)}</p>
      {(["x", "y"] as const).map((axis) => (
        <label key={axis} className="event-inspector__field">
          <span className="event-inspector__field-label">{axis.toUpperCase()} (steps)</span>
          <input
            type="number"
            className="event-inspector__input"
            value={draft[axis]}
            onChange={(e) => setDraft({ ...draft, [axis]: e.target.value })}
            onBlur={commit}
            onKeyDown={blurOnEnter}
          />
        </label>
      ))}
      <div className="event-inspector__actions event-inspector__actions--gbc">
        <button
          type="button"
          className="map-canvas__btn event-inspector__add-btn"
          disabled={pending !== null}
          onClick={() => run("duplicate", onDuplicate(selected.kind, duplicateArgs(selected.kind, ev, stepsW, stepsH)))}
        >
          {pending === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        <button type="button" className="map-canvas__btn event-inspector__delete-btn" disabled={pending !== null} onClick={() => run("delete", onDelete({ kind: selected.kind, index: selected.index }))}>
          {pending === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
