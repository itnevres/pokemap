export type LensId = "level-curve" | "empty-maps" | "unused-species" | "method";

const LENS_ORDER: LensId[] = ["level-curve", "empty-maps", "unused-species", "method"];

const LENS_LABEL: Record<LensId, string> = {
  "level-curve": "Level curve",
  "empty-maps": "Empty maps",
  "unused-species": "Unused species",
  method: "Method",
};

export interface LensPanelSummary {
  /** `coverage().mapsWithoutEncounters.length` -- see the doc comment on
   *  `Coverage.mapsWithoutEncounters` in packages/core/src/analyse/
   *  coverage.ts. Interpolated into the empty-maps legend at render time,
   *  never hardcoded here, so the copy stays honest if the corpus ever
   *  changes -- the 982 in this file's own tests is a fixture value, not a
   *  number this component is allowed to assume. */
  emptyMaps: number;
  /** `coverage().unusedSpecies.length`, same "interpolated, never
   *  hardcoded" rule as emptyMaps above. */
  unusedSpecies: number;
}

export interface LensPanelProps {
  active: LensId | null;
  onChange: (lens: LensId | null) => void;
  summary: LensPanelSummary;
  /** Wired by WorldCanvas to the empty-maps legend's own "next action"
   *  (spec §9: a legend states what to do next, not just what colours
   *  mean). Optional so this component stays fully renderable -- and
   *  testable -- standalone; the button simply does nothing if unset. */
  onListEmptyMaps?: () => void;
}

const LEGEND_COPY: Record<LensId, (s: LensPanelSummary) => string> = {
  "level-curve": () =>
    "Colour is the average encounter level, weighted by encounter rate. Blue is low, red is high. Look for maps that jump several levels above their neighbours.",
  "empty-maps": (s) =>
    `${s.emptyMaps} maps have no encounters. Many should not — buildings, corridors, single rooms. Click to list them.`,
  "unused-species": (s) =>
    `${s.unusedSpecies} species appear in no encounter table. They may still be gifts, statics or trades.`,
  method: () => "Which maps reward surfing, fishing or rock smash.",
};

/**
 * Review fix: the method lens used to paint three tints (WorldCanvas.tsx's
 * methodTintFor: water/fishing/rock-smash) with no key anywhere mapping a
 * colour to what it means -- the required copy above says WHICH methods
 * exist, but not which swatch is which, violating DESIGN.md's own stated
 * rule verbatim ("Colour is never the sole carrier of meaning: every
 * overlay kind pairs with a distinct shape or label in its legend"). The
 * other three lenses already clear that bar (level-curve names its
 * endpoints in its own copy; empty-maps/unused-species are single-state,
 * so there is nothing to disambiguate). `slug` matches WorldCanvas's own
 * CSS var names exactly (`--encounter-water` etc.) and this file's own
 * swatch classes below, the same slug EncounterGutter's legend key
 * already established for the identical three colours.
 */
const METHOD_LENS_KEY: Array<{ slug: "water" | "fishing" | "rock-smash"; label: string }> = [
  { slug: "water", label: "Water (surfing)" },
  { slug: "fishing", label: "Fishing" },
  { slug: "rock-smash", label: "Rock Smash" },
];

/**
 * Coverage lenses (spec §9): level-curve, empty-maps, unused-species and
 * method. One active at a time, all off by default, and -- per spec's own
 * "no lens is ever active without its legend visible" -- the legend is not
 * a separate toggle a caller could get out of sync with `active`; it is
 * this component's own render, gated on the same prop.
 *
 * `active`/`onChange` are fully controlled by the caller (WorldCanvas):
 * clicking the already-active lens's own button calls `onChange(null)`
 * (turns it off); clicking any other calls `onChange(thatLens)`. Because
 * there is only ever one `active` value to begin with, "one lens active at
 * a time" falls out of that shape for free -- this component never needs
 * its own bookkeeping to enforce it.
 *
 * Purely a control, like SpeciesSpotlight: it draws no part of the world
 * itself. WorldCanvas turns `active` + the coverage data it already fetches
 * into the actual per-map tint overlay, the same "presentational child,
 * caller owns the canvas" split EncounterGutter established in Task 28.
 */
export function LensPanel({ active, onChange, summary, onListEmptyMaps }: LensPanelProps) {
  return (
    <div className="lens-panel">
      <div className="lens-panel__toggles" role="group" aria-label="Coverage lenses">
        {LENS_ORDER.map((lens) => (
          <button
            key={lens}
            type="button"
            className="lens-panel__toggle"
            aria-pressed={active === lens}
            aria-label={`${LENS_LABEL[lens]} lens (${lens})`}
            onClick={() => onChange(active === lens ? null : lens)}
          >
            {LENS_LABEL[lens]}
          </button>
        ))}
      </div>

      {active && (
        <div className="lens-panel__legend" role="note">
          <p className="lens-panel__legend-title">{LENS_LABEL[active]}</p>
          <p className="lens-panel__legend-body">{LEGEND_COPY[active](summary)}</p>
          {active === "method" && (
            <ul className="lens-panel__legend-key">
              {METHOD_LENS_KEY.map((m) => (
                <li key={m.slug} className="lens-panel__legend-item">
                  <i className={`lens-panel__legend-swatch lens-panel__legend-swatch--${m.slug}`} />
                  <span>{m.label}</span>
                </li>
              ))}
            </ul>
          )}
          {active === "empty-maps" && (
            <button type="button" className="lens-panel__legend-action" onClick={onListEmptyMaps}>
              List them
            </button>
          )}
        </div>
      )}
    </div>
  );
}
