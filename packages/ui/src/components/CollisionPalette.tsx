export interface CollisionElevation {
  collision: number;
  elevation: number;
}

export interface CollisionPaletteProps {
  selected: CollisionElevation;
  onSelect: (next: CollisionElevation) => void;
}

const COLLISION_LABELS = ["collision 0", "collision 1 (impassable)", "collision 2", "collision 3"];

/**
 * Porymap-parity collision/elevation picker: a 4-swatch collision strip
 * (0-3 -- decomp docs and the subject repo's own corpus both treat 1 as
 * impassable and 0/2/3 as passable-but-distinct, e.g. water-current tiles)
 * plus a 16-swatch elevation strip (0-15, where 0 means "inherit" and 15
 * means "always on top"). Selecting either dimension keeps the other --
 * mirrors the click-to-select shape the rest of this app's palettes/toggles
 * already use (aria-pressed on the active swatch, see MapCanvas.tsx's own
 * overlay-toggle buttons) rather than inventing a new interaction pattern.
 */
export function CollisionPalette({ selected, onSelect }: CollisionPaletteProps) {
  return (
    <div className="collision-palette">
      <div className="collision-palette__section">
        <div className="collision-palette__label">Collision</div>
        <div className="collision-palette__strip">
          {COLLISION_LABELS.map((label, collision) => (
            <button
              key={collision}
              type="button"
              aria-label={label}
              aria-pressed={selected.collision === collision}
              className={`collision-swatch collision-swatch--${collision}`}
              onClick={() => onSelect({ collision, elevation: selected.elevation })}
            >
              {collision}
            </button>
          ))}
        </div>
      </div>
      <div className="collision-palette__section">
        <div className="collision-palette__label">Elevation</div>
        <div className="collision-palette__strip collision-palette__strip--elevation">
          {Array.from({ length: 16 }, (_, elevation) => (
            <button
              key={elevation}
              type="button"
              aria-label={`elevation ${elevation}`}
              aria-pressed={selected.elevation === elevation}
              className="elevation-swatch"
              onClick={() => onSelect({ collision: selected.collision, elevation })}
            >
              {elevation}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
