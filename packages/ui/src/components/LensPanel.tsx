import { useState } from "react";
import { displaySpeciesName, speciesIconUrl } from "../encounters/summary.js";

export type LensId = "level-curve" | "empty-maps" | "unused-species" | "method";

const LENS_ORDER: LensId[] = ["level-curve", "empty-maps", "unused-species", "method"];

const LENS_LABEL: Record<LensId, string> = {
  "level-curve": "Level curve",
  "empty-maps": "Empty maps",
  "unused-species": "Unused species",
  method: "Method",
};

export interface LensPanelSummary {
  /** `coverage().mapsWithoutEncounters` -- see the doc comment on
   *  `Coverage.mapsWithoutEncounters` in packages/core/src/analyse/
   *  coverage.ts. The count in the empty-maps legend is its `.length`,
   *  interpolated at render time, never hardcoded here, so the copy stays
   *  honest if the corpus ever changes -- the 982 in this file's own tests is
   *  a fixture value, not a number this component is allowed to assume. */
  emptyMapNames: string[];
  /** `coverage().unusedSpecies`, same "interpolated, never hardcoded" rule
   *  as emptyMapNames above. */
  unusedSpeciesNames: string[];
}

export interface LensPanelProps {
  active: LensId | null;
  onChange: (lens: LensId | null) => void;
}

export interface LensLegendProps {
  active: LensId | null;
  /** `null` = coverage has not loaded yet: the row shows only its title and
   *  "Loading coverage…" (no counts, list buttons or method key), so a lens
   *  clicked early never states a false "0 maps". */
  summary: LensPanelSummary | null;
  /** A map-list entry was clicked; the app selects the map and jumps there
   *  (the tree-click path). Unset (a dungeon view: a world jump means nothing
   *  there) means the Empty maps list action is not rendered at all, so no
   *  entry is ever shown disabled. */
  onJumpToMap?: (name: string) => void;
  /** Plan 6b Task 6 (additive): overrides the method lens's own legend key
   *  -- GBC's method tint precedence (water > fish > headbutt > rock; grass
   *  is never tinted) doesn't match GBA's own (water/fishing/rock-smash).
   *  Defaults to today's `METHOD_LENS_KEY`. */
  methodKey?: Array<{ slug: string; label: string }>;
  /** Plan 6b Task 6 (additive): per-lens legend copy overrides, merged OVER
   *  `LEGEND_COPY` (a caller supplying only `method`/`level-curve` leaves
   *  `empty-maps`/`unused-species` at their GBA defaults -- both already
   *  read generically off `summary`, and GBC's own `/api/coverage` carries
   *  the same `mapsWithoutEncounters`/`unusedSpecies` arrays GBA's does). */
  legendCopy?: Partial<Record<LensId, (s: LensPanelSummary) => string>>;
}

const LEGEND_COPY: Record<LensId, (s: LensPanelSummary) => string> = {
  "level-curve": () =>
    "Colour is the average encounter level, weighted by encounter rate. Blue is low, red is high. Look for maps that jump several levels above their neighbours.",
  "empty-maps": (s) =>
    `${s.emptyMapNames.length} ${s.emptyMapNames.length === 1 ? "map has" : "maps have"} no encounters. Many should not — buildings, corridors, single rooms. Click to list them.`,
  "unused-species": (s) =>
    s.unusedSpeciesNames.length === 1
      ? "1 species appears in no encounter table. It may still be a gift, static or trade."
      : `${s.unusedSpeciesNames.length} species appear in no encounter table. They may still be gifts, statics or trades.`,
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
 * swatch classes below, the same slug the old encounter gutter's legend key
 * already established for the identical three colours.
 */
const METHOD_LENS_KEY: Array<{ slug: "water" | "fishing" | "rock-smash"; label: string }> = [
  { slug: "water", label: "Water (surfing)" },
  { slug: "fishing", label: "Fishing" },
  { slug: "rock-smash", label: "Rock Smash" },
];

/**
 * Coverage lenses (spec §9): level-curve, empty-maps, unused-species and
 * method. One active at a time, all off by default.
 *
 * `active`/`onChange` are fully controlled by the caller (WorldCanvas):
 * clicking the already-active lens's own button calls `onChange(null)`
 * (turns it off); clicking any other calls `onChange(thatLens)`. Because
 * there is only ever one `active` value to begin with, "one lens active at
 * a time" falls out of that shape for free.
 *
 * This is only the toggles. The legend is a row the canvas renders below the
 * toolbar (`LensLegend`, never a popover over the map); spec's "no lens is
 * ever active without its legend" is now the caller's rule: both canvases
 * render `LensLegend` with the same `lens` state they give `LensPanel`.
 *
 * Purely a control, like SpeciesSpotlight: it draws no part of the world
 * itself.
 */
export function LensPanel({ active, onChange }: LensPanelProps) {
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
    </div>
  );
}

/** The active lens's legend, as an in-flow row (CSS `.world-canvas__legend-row`).
 *  The `key` remounts the row on every lens change, so a list always starts
 *  closed (no reset effect: it would run a render late). */
export function LensLegend({ active, ...rest }: LensLegendProps) {
  return active === null ? null : <LensLegendRow key={active} active={active} {...rest} />;
}

function LensLegendRow({
  active,
  summary,
  onJumpToMap,
  methodKey,
  legendCopy,
}: LensLegendProps & { active: LensId }) {
  const [listOpen, setListOpen] = useState(false);
  const key = methodKey ?? METHOD_LENS_KEY;
  const copy = summary ? (legendCopy?.[active] ?? LEGEND_COPY[active])(summary) : "Loading coverage…";
  const listAction = (label: string) => (
    <button
      type="button"
      className="lens-panel__legend-action"
      aria-expanded={listOpen}
      onClick={() => setListOpen((o) => !o)}
    >
      {listOpen ? "Hide list" : label}
    </button>
  );
  return (
    <div className="world-canvas__legend-row" role="note" aria-label="Coverage lens legend">
      <p className="lens-panel__legend-title">{LENS_LABEL[active]}</p>
      <p className="lens-panel__legend-body">{copy}</p>
      {summary && active === "method" && (
        <ul className="lens-panel__legend-key">
          {key.map((m) => (
            <li key={m.slug} className="lens-panel__legend-item">
              <i className={`lens-panel__legend-swatch lens-panel__legend-swatch--${m.slug}`} />
              <span>{m.label}</span>
            </li>
          ))}
        </ul>
      )}
      {summary && active === "empty-maps" && onJumpToMap && summary.emptyMapNames.length > 0 && listAction("List them")}
      {summary && active === "unused-species" && summary.unusedSpeciesNames.length > 0 && listAction("Show list")}
      {listOpen && summary && onJumpToMap && active === "empty-maps" && (
        <ul className="lens-panel__list" aria-label="Maps with no encounters">
          {summary.emptyMapNames.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="lens-panel__list-btn"
                title={name}
                onClick={() => onJumpToMap(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {listOpen && summary && active === "unused-species" && (
        <ul className="lens-panel__list lens-panel__list--species" aria-label="Unused species">
          {summary.unusedSpeciesNames.map((s) => (
            <li key={s} className="lens-panel__species">
              <img src={speciesIconUrl(s)} alt="" width={24} height={24} loading="lazy" />
              <span title={displaySpeciesName(s)}>{displaySpeciesName(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
