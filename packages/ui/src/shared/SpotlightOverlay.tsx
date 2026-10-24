import type { Rect } from "../encounters/borderSide.js";

interface SpotlightHit { percent: number; minLevel: number; maxLevel: number }

/** Shared DOM for the per-map species spotlight; callers compute family-specific hit data and rectangles. */
export function SpotlightOverlay<T extends SpotlightHit>({ hits, entries }: {
  hits: readonly T[] | null;
  entries: readonly { map: string; rect: Rect; hit: T | null | undefined }[];
}) {
  if (hits === null) return null;
  return (
    <div className="world-canvas__spotlight" aria-hidden="true">
      {entries.map((e) =>
        e.hit ? (
          <div
            key={e.map}
            className="world-canvas__spotlight-hit"
            style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height }}
          >
            <span className="world-canvas__spotlight-badge">
              {`${e.hit.percent.toFixed(0)}% Lv ${e.hit.minLevel}-${e.hit.maxLevel}`}
            </span>
          </div>
        ) : (
          <div
            key={e.map}
            className="world-canvas__spotlight-dim"
            style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height }}
          />
        ),
      )}
    </div>
  );
}
