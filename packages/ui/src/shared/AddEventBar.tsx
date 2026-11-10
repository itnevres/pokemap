import { useLayoutEffect, useRef, useState, type Ref } from "react";
import type { EventKind } from "@pokemap/core/src/addEvent/types.js";
import { ADD_EVENT_ICONS } from "../components/toolIcons.js";

const LABELS: Record<EventKind, string> = {
  object: "Add Object: click a tile, then fill in the details",
  warp: "Add Warp: click a tile, then pick the destination",
  coord: "Add Coord Event: click a tile, then pick the trigger and script",
  bg: "Add BG Event: click a tile, then pick the sign or hidden item",
};

export function AddEventBar({ placing, onToggle, disabled = {}, ref }: {
  placing: EventKind | null;
  onToggle: (kind: EventKind) => void;
  disabled?: Partial<Record<EventKind, string>>;
  ref?: Ref<HTMLDivElement>;
}) {
  return <div ref={ref} className="add-event-bar" role="group" aria-label="Add events">
    {(Object.keys(LABELS) as EventKind[]).map(kind => <button key={kind} type="button"
      className="map-canvas__btn" aria-label={LABELS[kind]} aria-pressed={placing === kind}
      title={disabled[kind] ?? LABELS[kind]} disabled={disabled[kind] !== undefined}
      onClick={() => onToggle(kind)}>{ADD_EVENT_ICONS[kind]}</button>)}
  </div>;
}

/** Placement belongs to a visit and tool choice; both families use the same cancellation rules. */
export function useEventPlacement(mapName: string | null, tool: string | null, active: boolean) {
  const barRef = useRef<HTMLDivElement>(null);
  const [owner, setOwner] = useState({ mapName, tool, active });
  const [placing, setPlacing] = useState<EventKind | null>(null);
  const [pick, setPick] = useState<{ kind: EventKind; x: number; y: number; anchor: DOMRect } | null>(null);
  const clear = () => { setPlacing(null); setPick(null); };
  // Retire state before rendering children, including A -> B -> A and context exit/reentry.
  if (owner.mapName !== mapName || owner.tool !== tool || owner.active !== active) {
    setOwner({ mapName, tool, active });
    clear();
  }
  const latest = useRef({ placing, clear });
  latest.current = { placing, clear };
  // Register before the World host's passive capture listener, even before placement starts.
  useLayoutEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (!latest.current.placing || event.key !== "Escape" || event.defaultPrevented || document.querySelector('[aria-modal="true"]:not([data-warp-popup])')) return;
      const popup = document.querySelector("[data-warp-popup]");
      if (popup && !popup.contains(barRef.current)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      latest.current.clear();
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, []);
  return { placing, pick, clear, barRef,
    onToggle: (kind: EventKind) => { setPick(null); setPlacing(old => old === kind ? null : kind); },
    onEventPick: (x: number, y: number, anchor: DOMRect) => {
      if (!placing) return;
      setPick({ kind: placing, x, y, anchor });
      setPlacing(null);
    },
  };
}
