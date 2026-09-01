import { useState } from "react";
import type { Method, SpeciesChance } from "@pokemap/core/src/load/encounters.js";

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

export interface EncounterGutterMapEntry {
  map: string;
  rect: EncounterGutterRect;
  /**
   * Per-method species chances for this map's default (first/day) table,
   * mirroring `/api/encounters/:map`'s wire shape exactly: a method key
   * absent means that method has no table at all. `undefined` means the
   * caller's fetch for this map has not resolved yet; an empty object means
   * it resolved to "no encounters here" (982 of 1,209 maps -- spec §9).
   * Both render nothing for this one map, silently, rather than an error or
   * a placeholder badge -- see the component doc comment below.
   */
  methods: Partial<Record<Method, SpeciesChance[]>> | undefined;
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

/** Icons shown per method row before truncating to "+N more". speciesChances
 *  already returns each method sorted by percent descending, so what's shown
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

/** Distinct species across every method a map has data for -- what the
 *  low-zoom badge counts. A species reachable by two methods (e.g. also
 *  fishable) is one species, not two. */
function distinctSpeciesCount(methods: Partial<Record<Method, SpeciesChance[]>>): number {
  const seen = new Set<string>();
  for (const chances of Object.values(methods)) for (const c of chances ?? []) seen.add(c.species);
  return seen.size;
}

/**
 * The per-map encounter gutter: species icons along each visible map's edge
 * in the world view, grouped by method, with true catch percentages on
 * hover/focus -- read from `speciesChances`' own `percent` field, never a
 * slot count. See packages/core/src/load/encounters.ts for why that
 * distinction matters (slot 0 of land_mons is 20%, slot 11 is 1%).
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const collapsed = zoom < LOW_ZOOM_THRESHOLD;

  return (
    <div className="encounter-gutter">
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
              Species icons along each map&rsquo;s edge, grouped by method. Hover or focus an icon for its species,
              level range and true catch percentage.
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
          const methods = entry.methods;
          if (!methods) return null; // still loading -- nothing to show yet, not an error
          const present = METHOD_ORDER.filter((m) => (methods[m]?.length ?? 0) > 0);
          if (present.length === 0) return null; // no encounters at all here -- a normal state (spec §9), not a gap to flag

          const left = entry.rect.x;
          const top = entry.rect.y + entry.rect.height + 4;

          if (collapsed) {
            const count = distinctSpeciesCount(methods);
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
              {present.map((method) => {
                const chances = methods[method]!;
                const shown = chances.slice(0, ICON_CAP);
                return (
                  <div className="encounter-gutter__row" key={method}>
                    <span
                      className={`encounter-gutter__method-tag encounter-gutter__method-tag--${METHOD_SLUG[method]}`}
                    >
                      {METHOD_LABEL[method]}
                    </span>
                    <div className="encounter-gutter__icons">
                      {shown.map((c) => {
                        const key = `${entry.map}:${method}:${c.species}`;
                        const label = describeChance(c);
                        return (
                          <button
                            type="button"
                            key={c.species}
                            className="encounter-gutter__icon"
                            aria-label={label}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey((k) => (k === key ? null : k))}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey((k) => (k === key ? null : k))}
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
                            {hoveredKey === key && (
                              <span className="encounter-gutter__tooltip" role="tooltip">
                                {label}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {chances.length > ICON_CAP && (
                        <span className="encounter-gutter__more">+{chances.length - ICON_CAP}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
