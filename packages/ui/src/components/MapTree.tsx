import { useMemo, useState } from "react";

export interface MapGroupsData {
  groupOrder: string[];
  groups: Record<string, string[]>;
}

export interface MapTreeProps {
  data: MapGroupsData;
  selected: string | null;
  onSelect(name: string): void;
}

export function MapTree({ data, selected, onSelect }: MapTreeProps) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.groupOrder
      .map((g) => ({
        group: g,
        maps: (data.groups[g] ?? []).filter((m) => !q || m.toLowerCase().includes(q)),
      }))
      .filter((g) => g.maps.length > 0);
  }, [data, filter]);

  return (
    <nav className="map-tree" aria-label="Maps">
      <input
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
              {maps.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    className="map-tree__map"
                    aria-current={selected === m ? "true" : undefined}
                    onClick={() => onSelect(m)}
                  >
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </nav>
  );
}
