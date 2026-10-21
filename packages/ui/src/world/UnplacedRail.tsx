import { memo, useMemo } from "react";

export interface UnplacedRailProps {
  unplacedNames: string[];
  filter: string;
  onFilterChange: (value: string) => void;
}

/**
 * Review fix: this used to be built inline inside WorldCanvas's own render,
 * so canvas-state churn that has nothing to do with the rail -- pan and
 * hover state, both updated at pointer frequency by onMouseMove -- forced a
 * full re-render and re-reconciliation of all 1,028 <li> rows (the live
 * corpus's unplaced-singleton count with the dungeon toggle off) on every
 * single frame. That defeats Task 25's own "panning stays smooth"
 * acceptance criterion in exactly the one mode (dungeons off) this rail
 * exists to serve -- likely missed by prior spec-review passes because the
 * default sidecar has dungeons ON, where the rail is empty.
 *
 * Wrapped in React.memo and given only the three props it actually needs
 * (the raw unplaced-names list, the current filter string, and a
 * filter-change callback -- NOT a pre-filtered list, so the filtering
 * itself also lives here, out of WorldCanvas's own per-render work), so a
 * pan or hover update -- which changes neither -- leaves this whole subtree
 * untouched. `onFilterChange` must stay a `useState` setter passed straight
 * through by its caller (never a fresh inline arrow function) for the memo
 * comparison to actually hold across those unrelated re-renders.
 */
export const UnplacedRail = memo(function UnplacedRail({ unplacedNames, filter, onFilterChange }: UnplacedRailProps) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? unplacedNames.filter((n) => n.toLowerCase().includes(q)) : unplacedNames;
  }, [unplacedNames, filter]);

  return (
    <aside className="world-canvas__rail" aria-label="Unplaced maps">
      <div className="world-canvas__rail-header">
        <span className="world-canvas__rail-title">Unplaced</span>
        <span className="world-canvas__rail-count">{unplacedNames.length}</span>
      </div>
      <input
        className="world-canvas__rail-filter"
        placeholder="Filter…"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="world-canvas__rail-empty">
          {unplacedNames.length === 0 ? "Every map is placed." : `No matches for “${filter}”.`}
        </p>
      ) : (
        <ul className="world-canvas__rail-list">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="world-canvas__rail-item"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
});
