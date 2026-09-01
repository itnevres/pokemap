import { useRef, useState } from "react";
import type { Method, Rod, SpeciesChance } from "@pokemap/core/src/load/encounters.js";

/** Screen-space rect of one map placement in the world view -- the same
 *  numbers WorldCanvas already computes for panning/zooming a placement
 *  (`p.x * zoom + pan.x`, etc.), just handed down rather than recomputed
 *  here. */
export interface EncounterGutterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One row of the gutter's strip: a method, its species chances, and -- for
 * `fishing_mons` only -- which rod they were computed for. `fishing_mons` is
 * not one distribution but three independent ones (Old/Good/Super Rod, each
 * summing to 100 -- see packages/core/src/load/encounters.ts's own
 * FISHING_RODS and its "three distributions packed into one array" comment),
 * so a single "Fishing" row showing only the old-rod slice would silently
 * hide two thirds of a map's fishing species behind a label that doesn't say
 * so. `rod` is what lets the UI label each row honestly (`rowLabel` below)
 * instead of picking one rod and staying quiet about it.
 */
export interface EncounterGutterRow {
  method: Method;
  rod?: Rod;
  chances: SpeciesChance[];
}

export interface EncounterGutterMapEntry {
  map: string;
  rect: EncounterGutterRect;
  /**
   * This map's encounter rows, mirroring `/api/encounters/:map`'s wire shape
   * exactly: one row per (method) or, for fishing, per (method, rod) that
   * actually has a table -- a method/rod combination with no table simply
   * has no row, rather than one present with `[]`. `undefined` means the
   * caller's fetch for this map has not resolved yet; an empty array means
   * it resolved to "no encounters here" (982 of 1,209 maps -- spec §9).
   * Both render nothing for this one map, silently, rather than an error or
   * a placeholder badge -- see the component doc comment below.
   */
  methods: EncounterGutterRow[] | undefined;
}

export interface EncounterGutterProps {
  maps: EncounterGutterMapEntry[];
  /** Screen px per world tile -- the world view's current zoom. Used only to
   *  decide the low-zoom collapse threshold below. */
  zoom: number;
}

const METHOD_ORDER: Method[] = ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"];

const METHOD_LABEL: Record<Method, string> = {
  land_mons: "Land",
  water_mons: "Water",
  rock_smash_mons: "Rock Smash",
  fishing_mons: "Fishing",
};

const METHOD_SLUG: Record<Method, string> = {
  land_mons: "land",
  water_mons: "water",
  rock_smash_mons: "rock-smash",
  fishing_mons: "fishing",
};

const ROD_LABEL: Record<Rod, string> = {
  old: "Old Rod",
  good: "Good Rod",
  super: "Super Rod",
};

/** "Fishing (Old Rod)" for a fishing row, "Land" for anything else -- the
 *  one place that decides whether a row needs to disclose its rod scope. */
const rowLabel = (row: EncounterGutterRow): string =>
  row.rod ? `${METHOD_LABEL[row.method]} (${ROD_LABEL[row.rod]})` : METHOD_LABEL[row.method];

/** Stable identity for a row -- method alone is not unique once fishing can
 *  contribute up to three rows for the same map. */
const rowKey = (row: EncounterGutterRow): string => (row.rod ? `${row.method}:${row.rod}` : row.method);

/**
 * At and above this many screen px per world tile, per-species icons are
 * legible; below it they collapse to a plain count badge. Reuses
 * WorldCanvas's own LOD_ZOOM_THRESHOLD value (4) rather than inventing a
 * second number -- a different concern (mip level vs. this overlay), same
 * "too zoomed out for per-map detail" meaning. WorldCanvas does not export
 * its constant, so this is kept as an independent literal with this comment
 * as the tether between them.
 */
const LOW_ZOOM_THRESHOLD = 4;

/** Icons shown per row before truncating to "+N more". speciesChances
 *  already returns each row sorted by percent descending, so what's shown
 *  is always the most likely species, never an arbitrary slice. */
const ICON_CAP = 6;

const ICON_SIZE = 20;

/** "SPECIES_NIDORAN_F" -> "Nidoran F". Display-only; every lookup (icon URL,
 *  hover key) still uses the raw constant. */
const speciesToDisplayName = (species: string): string =>
  species
    .replace(/^SPECIES_/, "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

const iconUrl = (species: string): string => `/api/species/${encodeURIComponent(species)}/icon.png`;

/** Species, level band and the TRUE percentage from speciesChances -- never
 *  `slots.length`. This is the one place that distinction has to hold; every
 *  other function here just passes a SpeciesChance through untouched. */
const describeChance = (c: SpeciesChance): string =>
  `${speciesToDisplayName(c.species)} · Lv ${c.minLevel}-${c.maxLevel} · ${c.percent.toFixed(1)}%`;

/** Distinct species across every row a map has data for -- what the
 *  low-zoom badge counts. A species reachable by two rows (e.g. land AND
 *  Old Rod fishing) is one species, not two. */
function distinctSpeciesCount(rows: EncounterGutterRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) for (const c of row.chances) seen.add(c.species);
  return seen.size;
}

/** A hovered/focused icon's tooltip content plus WHERE to anchor it,
 *  computed once at hover time (see showTooltip below) rather than tracked
 *  as a CSS-relative child of the icon. */
interface TooltipState {
  key: string;
  label: string;
  x: number;
  y: number;
}

/**
 * The per-map encounter gutter: species icons along each visible map's edge
 * in the world view, grouped by method (fishing further split by rod --
 * see EncounterGutterRow), with true catch percentages on hover/focus --
 * read from `speciesChances`' own `percent` field, never a slot count. See
 * packages/core/src/load/encounters.ts for why that distinction matters
 * (slot 0 of land_mons is 20%, slot 11 is 1%).
 *
 * Off by default behind one toggle (spec §9); turning it on opens its
 * legend, and the legend is never shown without the toggle being on. Below
 * `LOW_ZOOM_THRESHOLD`, a map's strip collapses to a plain species-count
 * badge rather than icons too small to tell apart -- "unreadable icon soup"
 * per Task 28 Step 5.
 *
 * Purely presentational: `maps` and `zoom` are supplied by the caller
 * (WorldCanvas), which already owns the pan/zoom screen-math every
 * placement needs and the fetch that fills in `methods`. Meant to be
 * mounted once, absolutely positioned over `.world-canvas__viewport`
 * (`position: relative`, matching how its own tooltip/toast already work --
 * see packages/ui/src/styles.css). This component's own root is
 * `pointer-events: none` so it never intercepts the canvas's own panning;
 * only the toggle button and each icon button opt back in to receiving
 * pointer events (see styles.css).
 */
export function EncounterGutter({ maps, zoom }: EncounterGutterProps) {
  const [enabled, setEnabled] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // Positioning root for the tooltip's own left/top -- see showTooltip.
  // Deliberately NOT the element `position: relative` is declared on for
  // CSS purposes (this component's root already is, via .encounter-gutter);
  // this ref exists only to read that same element's live screen rect.
  const containerRef = useRef<HTMLDivElement>(null);

  const collapsed = zoom < LOW_ZOOM_THRESHOLD;

  // Review fix: the tooltip used to be a child of each icon button,
  // positioned via CSS alone (bottom: 100%, relative to the icon). That put
  // it inside TWO nested stacking contexts it could never escape --
  // .encounter-gutter__strip (position: absolute + z-index: 1) and, while
  // hovered/focused, .encounter-gutter__icon itself (position: relative +
  // z-index: 1 from its own :hover/:focus-visible rule) -- so no z-index on
  // the tooltip, however high, could ever paint it above
  // .encounter-gutter__control's legend; a CSS stacking context traps its
  // descendants regardless of their own z-index value. Confirmed live: a
  // focused icon under the open legend showed its tooltip clipped at the
  // legend's edge.
  //
  // Fixed by lifting the tooltip out of that subtree entirely, mirroring
  // WorldCanvas's own tooltip exactly (packages/ui/src/components/
  // WorldCanvas.tsx's onMouseMove: `e.currentTarget.getBoundingClientRect()`
  // read at the moment of the event, stored in state, rendered as a single
  // top-level sibling positioned via absolute left/top) -- not a new
  // pattern invented for this file. Computing the rect at hover time means
  // no per-frame position tracking is needed; the icon does not move while
  // its own tooltip is showing.
  const showTooltip = (e: { currentTarget: HTMLElement }, key: string, label: string) => {
    const iconRect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    setTooltip({
      key,
      label,
      x: iconRect.left - (containerRect?.left ?? 0) + iconRect.width / 2,
      y: iconRect.top - (containerRect?.top ?? 0),
    });
  };
  const hideTooltip = (key: string) => setTooltip((t) => (t?.key === key ? null : t));

  return (
    <div className="encounter-gutter" ref={containerRef}>
      <div className="encounter-gutter__control">
        <button
          type="button"
          className="encounter-gutter__toggle"
          aria-pressed={enabled}
          onClick={() => setEnabled((e) => !e)}
        >
          Encounters
        </button>

        {enabled && (
          <div className="encounter-gutter__legend" role="note">
            <p className="encounter-gutter__legend-title">Encounter gutter</p>
            <p className="encounter-gutter__legend-body">
              Species icons along each map&rsquo;s edge, grouped by method &mdash; fishing further split into Old,
              Good and Super Rod rows, since each rod is its own 100% distribution. Hover or focus an icon for its
              species, level range and true catch percentage.
            </p>
            <ul className="encounter-gutter__legend-key">
              {METHOD_ORDER.map((m) => (
                <li key={m} className="encounter-gutter__legend-item">
                  <i className={`encounter-gutter__legend-swatch encounter-gutter__legend-swatch--${METHOD_SLUG[m]}`} />
                  <span>{METHOD_LABEL[m]}</span>
                </li>
              ))}
            </ul>
            <p className="encounter-gutter__legend-hint">
              Zoomed out, a map shows just its species count &ndash; zoom in to see and hover individual icons.
            </p>
          </div>
        )}
      </div>

      {enabled &&
        maps.map((entry) => {
          const rows = entry.methods;
          if (!rows) return null; // still loading -- nothing to show yet, not an error
          if (rows.length === 0) return null; // no encounters at all here -- a normal state (spec §9), not a gap to flag

          const left = entry.rect.x;
          const top = entry.rect.y + entry.rect.height + 4;

          if (collapsed) {
            const count = distinctSpeciesCount(rows);
            return (
              <div
                key={entry.map}
                className="encounter-gutter__badge"
                style={{ left, top }}
                title={`${entry.map}: ${count} encounter species`}
              >
                {count} species
              </div>
            );
          }

          return (
            <div key={entry.map} className="encounter-gutter__strip" style={{ left, top }}>
              {rows.map((row) => {
                const shown = row.chances.slice(0, ICON_CAP);
                return (
                  <div className="encounter-gutter__row" key={rowKey(row)}>
                    <span
                      className={`encounter-gutter__method-tag encounter-gutter__method-tag--${METHOD_SLUG[row.method]}`}
                    >
                      {rowLabel(row)}
                    </span>
                    <div className="encounter-gutter__icons">
                      {shown.map((c) => {
                        const key = `${entry.map}:${rowKey(row)}:${c.species}`;
                        const label = describeChance(c);
                        return (
                          <button
                            type="button"
                            key={c.species}
                            className="encounter-gutter__icon"
                            aria-label={label}
                            onMouseEnter={(e) => showTooltip(e, key, label)}
                            onMouseLeave={() => hideTooltip(key)}
                            onFocus={(e) => showTooltip(e, key, label)}
                            onBlur={() => hideTooltip(key)}
                          >
                            <img
                              className="encounter-gutter__icon-img"
                              src={iconUrl(c.species)}
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              loading="lazy"
                              // The subject corpus has icon art for every
                              // species it defines, but this is read-only
                              // data this tool does not control -- a species
                              // /api/species/:name/icon.png 404s for (no
                              // graphics/pokemon/<x>/icon.png) should hide
                              // the browser's broken-image glyph, not scar
                              // the row with it. The button's own aria-label
                              // still carries the species/level/percent text
                              // regardless.
                              onError={(e) => {
                                e.currentTarget.style.visibility = "hidden";
                              }}
                            />
                          </button>
                        );
                      })}
                      {row.chances.length > ICON_CAP && (
                        <span className="encounter-gutter__more">+{row.chances.length - ICON_CAP}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

      {/* Top-level sibling, NOT nested inside any icon/strip -- see the
          long comment on showTooltip above for why nesting is what broke
          this the first time. Anchored at the hovered/focused icon's own
          top-center point (computed once, at hover time); CSS centers and
          lifts it above that point via `transform`. */}
      {tooltip && (
        <span className="encounter-gutter__tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.label}
        </span>
      )}
    </div>
  );
}
