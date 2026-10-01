import { useEffect, useMemo, useRef, useState } from "react";
import { isDrawnByDefault, type MapVisibilityInfo } from "../world/visibility.js";

export interface MapGroupsData {
  groupOrder: string[];
  groups: Record<string, string[]>;
}

export interface MapTreeProps {
  data: MapGroupsData;
  selected: string | null;
  onSelect(name: string): void;
  /** World mode is active -- the third "greyed" visual state (spec §3.3)
   *  only ever applies there, not in plain Map mode. Defaults to false so
   *  every existing Map-mode call site is unaffected. */
  worldMode?: boolean;
  /** From useWorldVisibility. Null while loading/disabled -- treated as
   *  "nothing greyed yet" so the list doesn't flash entirely grey before
   *  the fetch resolves. */
  visibility?: Map<string, MapVisibilityInfo> | null;
}

export function MapTree({ data, selected, onSelect, worldMode = false, visibility = null }: MapTreeProps) {
  const [filter, setFilter] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  // Reveal the selected row (expand its group if collapsed, scroll it in).
  // Deps are `[selected]` only: typing in the filter, new `data`, worldMode
  // or visibility must not yank the list around; and while the filter has
  // focus the user is typing, so a selection change leaves the list alone.
  // A selected row hidden by the filter is not revealed (nor retried) when
  // the filter later clears: the user is browsing at that point.
  useEffect(() => {
    if (!selected || document.activeElement === filterRef.current) return;
    const row = navRef.current?.querySelector<HTMLElement>('.map-tree__map[aria-current="true"]');
    if (!row) return; // filtered out: nothing to show
    const group = row.closest("details");
    if (group && !group.open) group.open = true;
    row.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.groupOrder
      .map((g) => ({
        group: g,
        maps: (data.groups[g] ?? []).filter((m) => !q || m.toLowerCase().includes(q)),
      }))
      .filter((g) => g.maps.length > 0);
  }, [data, filter]);

  // A map is greyed when it is not currently drawn in World mode: either
  // it has no real placement at all, or it does but isn't drawn by
  // default and was never manually placed (visibility.ts's own rule,
  // shared with WorldCanvas -- see that module's doc comment for why this
  // is not a second copy of the same logic).
  const isGreyed = (name: string): boolean => {
    if (!worldMode || !visibility) return false;
    const info = visibility.get(name);
    return !info || !isDrawnByDefault(info.mapType, info.manual);
  };

  return (
    <nav className="map-tree" aria-label="Maps" ref={navRef}>
      <input
        ref={filterRef}
        className="map-tree__filter"
        placeholder="Filter maps…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {visible.length === 0 ? (
        <p className="map-tree__empty">
          No maps match &ldquo;{filter}&rdquo;. Clear the filter to see all {data.groupOrder.length} groups.
        </p>
      ) : (
        visible.map(({ group, maps }) => (
          <details key={group} className="map-tree__group" open>
            <summary className="map-tree__summary">
              <span className="map-tree__group-name">{group.replace(/^gMapGroup_/, "")}</span>
              <span className="map-tree__count">{maps.length}</span>
            </summary>
            <ul className="map-tree__list">
              {maps.map((m) => {
                const greyed = isGreyed(m);
                return (
                  <li key={m}>
                    <button
                      type="button"
                      className={`map-tree__map${greyed ? " map-tree__map--greyed" : ""}`}
                      aria-current={selected === m ? "true" : undefined}
                      onClick={() => onSelect(m)}
                      title={greyed ? "Not currently drawn in the world view — click to reveal, or drag onto the canvas to place it" : undefined}
                      // Only a greyed entry is draggable: a shown map is already
                      // visible on the canvas and can be dragged directly from
                      // there via Shift+drag, so dragging it a second time from
                      // here would be a redundant way to do the same thing.
                      // draggable gates whether dragstart can ever fire at all,
                      // so onDragStart is safe to attach unconditionally --
                      // mirrors WorldCanvas.tsx's own UnplacedRail rail items.
                      draggable={greyed}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", m)}
                    >
                      {m}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ))
      )}
    </nav>
  );
}
