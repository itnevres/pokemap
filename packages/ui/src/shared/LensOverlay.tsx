import { useMemo } from "react";
import type { LensId } from "../components/LensPanel.js";
import type { Rect } from "../encounters/borderSide.js";

export interface LensOverlayPlacement {
  map: string;
}

export interface LensOverlayEntry {
  map: string;
  rect: Rect;
  color: string;
}

/** The per-map portion of the coverage lens; each world family supplies its own placement geometry. */
export function useLensOverlayEntries<T extends LensOverlayPlacement>({ lens, visible, rectFor, levelColorByMap, emptyMapNames, methodTintFor, encounterVersion }: {
  lens: LensId | null;
  visible: readonly T[];
  rectFor(placement: T): Rect;
  levelColorByMap: ReadonlyMap<string, string>;
  emptyMapNames: ReadonlySet<string>;
  methodTintFor(map: string): string | null;
  encounterVersion: number;
}): LensOverlayEntry[] {
  return useMemo(() => {
    if (!lens) return [] as LensOverlayEntry[];
    const out: LensOverlayEntry[] = [];
    for (const p of visible) {
      let color: string | null = null;
      if (lens === "level-curve") color = levelColorByMap.get(p.map) ?? null;
      else if (lens === "empty-maps") color = emptyMapNames.has(p.map) ? "var(--warn)" : null;
      else if (lens === "method") color = methodTintFor(p.map);
      // "unused-species" has no per-map visual -- see LensLegend's own
      // legend copy and species list for that lens: it is a fact about species, not about a
      // place on the map, so there is nothing here to tint.
      if (!color) continue;
      out.push({ map: p.map, rect: rectFor(p), color });
    }
    return out;
    // encounterVersion, not the canvas's encounterCacheRef itself (a ref, so it
    // would never usefully appear in a dependency array) -- the method lens
    // reads that ref via methodTintFor, and encounterVersion is exactly the
    // signal the canvas's encounter-fetch effect bumps whenever that ref's
    // contents change.
  }, [lens, visible, rectFor, levelColorByMap, emptyMapNames, methodTintFor, encounterVersion]);
}

export function LensOverlay({ lens, entries }: { lens: LensId | null; entries: readonly LensOverlayEntry[] }) {
  if (!lens || entries.length === 0) return null;
  return (
    <div className="world-canvas__lens" aria-hidden="true">
      {entries.map((e) => (
        <div
          key={e.map}
          className="world-canvas__lens-tint"
          style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height, background: e.color }}
        />
      ))}
    </div>
  );
}
