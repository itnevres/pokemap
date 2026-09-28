import { useLayoutEffect, useRef, useState } from "react";
import type { GbcEncounterChance, GbcEncounterMethod, GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { GbcTimeOfDay } from "./time.js";

/**
 * The GBC encounter gutter (Plan 6b Task 6) -- mirrors `EncounterGutter.tsx`
 * (`packages/ui/src/components/EncounterGutter.tsx`)'s own structure and CSS
 * classes exactly: off by default behind one toggle, the legend only shown
 * while it's on, a `pointer-events: none` root with only the toggle/legend
 * and each species chip opting back in, and a top-level-sibling tooltip
 * (never a child of the chip it describes -- see `EncounterGutter.tsx`'s own
 * long `showTooltip` comment for exactly why nesting broke that there once).
 *
 * Deliberately NOT a reuse of `EncounterGutter` itself: `GbcEncounterSource`
 * is a different shape from `EncounterGutterRow` (5 methods, not 4; each
 * source is already its own row -- no per-(method,rod) merge step is needed,
 * since the server already returns one source per morn/day/nite/rod/list
 * variant); GBC has no per-species icon art at all (a text chip, not an
 * `<img>` button); and GBC needs a client-side TIME filter GBA's gutter has
 * no equivalent of (the encounter cache is time-independent -- one fetch per
 * map ever -- so filtering by the app's current time happens here, at
 * render, not by refetching).
 */

/** Screen-space rect of one map placement -- the same numbers
 *  `GbcWorldCanvas` already computes for panning/zooming a placement. */
export interface GbcEncounterGutterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GbcEncounterGutterMapEntry {
  map: string;
  rect: GbcEncounterGutterRect;
  /** This map's full, unfiltered source list -- `undefined` means the
   *  caller's fetch for this map has not resolved yet (still loading,
   *  nothing to show); an empty array means it resolved to "no encounters
   *  here" (a real, normal state, not a gap). Time filtering happens inside
   *  this component (`matchesTime`), not by the caller. */
  sources: GbcEncounterSource[] | undefined;
}

export interface GbcEncounterGutterProps {
  maps: GbcEncounterGutterMapEntry[];
  /** Screen px per world BLOCK (not per tile -- GBC's native unit) --
   *  `GbcWorldCanvas`'s own current zoom. Used only for the low-zoom
   *  collapse threshold below. */
  zoom: number;
  time: GbcTimeOfDay;
}

/** Grouping order for the gutter's rows (spec's own "grass, water, fish,
 *  headbutt, rock"). */
const METHOD_ORDER: GbcEncounterMethod[] = ["grass", "water", "fish", "headbutt", "rock"];

const METHOD_LABEL: Record<GbcEncounterMethod, string> = {
  grass: "Grass",
  water: "Surf",
  fish: "Fish",
  headbutt: "Headbutt",
  rock: "Rock Smash",
};

/** CSS swatch/method-tag slug per method -- grass reuses GBA's own "land"
 *  colour (the same real-world concept, "walking in tall grass"), water/fish
 *  ("fishing")/rock ("rock-smash") reuse GBA's existing 3 tokens directly;
 *  only "headbutt" is a new token (`--encounter-headbutt`, `styles.css`).
 *  Distinct from `LensPanel`'s own GBC `methodKey` slugs (`GbcWorldCanvas`'s
 *  own list, water/fishing/headbutt/rock-smash) -- that list never includes
 *  grass at all, since grass is never a lens TINT (spec's own "Grass is
 *  never a tint"); this gutter shows grass ROWS, a different concern. */
const METHOD_SLUG: Record<GbcEncounterMethod, string> = {
  grass: "land",
  water: "water",
  fish: "fishing",
  headbutt: "headbutt",
  rock: "rock-smash",
};

const ROD_LABEL: Record<string, string> = { old: "Old Rod", good: "Good Rod", super: "Super Rod" };

/**
 * Time-matching rule (spec's own "Facts (measured)", re-verified against
 * `engine/events/fish.asm`'s `.TimeEncounter` -- `cp NITE_F / jr c,
 * .time_species` with `MORN_F=0, DAY_F=1, NITE_F=2`, so anything strictly
 * less than NITE (morn OR day) takes the "day" entry):
 *  - an untagged source (no `time` field at all -- water/headbutt/rock, and
 *    old-rod fish) always matches, regardless of the app's current time;
 *  - grass matches only when its own tag equals the app's current time
 *    exactly (morn/day/nite are three genuinely distinct grass tables);
 *  - a `fish` source tagged "day" matches at BOTH morn and day (the engine
 *    has no separate morn table for fishing -- "day" is really "not nite");
 *  - a `fish` source tagged "nite" matches only at nite.
 *
 * Exported and unit-tested with the full truth table, including the two
 * mutation-sensitive edges the spec names explicitly: old-rod (untagged)
 * fish is never filtered OUT regardless of time (mutation check #2), and
 * grass never matches every time (mutation check #6).
 */
export function matchesTime(source: { method: GbcEncounterMethod; time?: string }, time: GbcTimeOfDay): boolean {
  if (source.time === undefined) return true;
  if (source.method === "grass") return source.time === time;
  if (source.method === "fish") {
    if (source.time === "day") return time === "morn" || time === "day";
    if (source.time === "nite") return time === "nite";
  }
  return true;
}

/**
 * A row's own label, disclosing every scoping tag it carries -- mirrors
 * `EncounterGutter.tsx`'s own `rowLabel` reasoning (a row must say what it's
 * scoped to, never stay quiet about it): method, then rod (fish only), then
 * list (headbutt only), then time (grass/fish only), then " · swarm" for a
 * conditional source. Exact strings pinned against the spec's own examples:
 * "Grass · morn", "Surf", "Fish · Good Rod · day", "Fish · Old Rod",
 * "Headbutt · rare", "Rock Smash".
 */
export function rowLabel(source: GbcEncounterSource): string {
  const parts = [METHOD_LABEL[source.method]];
  if (source.rod) parts.push(ROD_LABEL[source.rod] ?? source.rod);
  if (source.list) parts.push(source.list);
  if (source.time) parts.push(source.time);
  if (source.conditional === "swarm") parts.push("swarm");
  return parts.join(" · ");
}

/** "SPECIES_PIKACHU"-style prefixes never occur in GBC wild data (Task 2's
 *  own `normalizeGbcSpecies` doc comment), so this is just Title Case, no
 *  prefix strip needed -- "CHIKORITA" -> "Chikorita". */
function displaySpeciesName(species: string): string {
  return species
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * A chip's own short label -- "Name 30% Lv 3-5" (spec's own example),
 * appending a trailing `+` to the level range for grass/water only (the
 * runtime `GRASS_WATER_LEVEL_BUFF_MAX` buff, spec's own "Facts"; the
 * gutter's own legend explains the `+`). Percent is ROUNDED here (a chip is
 * a short label, not full precision) -- the hover/focus tooltip shows the
 * same one-decimal precision `EncounterGutter.tsx`'s own `describeChance`
 * does. Exported and unit-tested, including mutation check #7 (dropping the
 * `+`).
 */
export function chipText(chance: GbcEncounterChance, method: GbcEncounterMethod): string {
  const buff = method === "grass" || method === "water" ? "+" : "";
  return `${displaySpeciesName(chance.species)} ${Math.round(chance.percent)}% Lv ${chance.minLevel}-${chance.maxLevel}${buff}`;
}

/** The chip tooltip's full-precision text -- mirrors `chipText` above but
 *  with one-decimal percent, the same "true percentage, never a slot count"
 *  precision `EncounterGutter.tsx`'s own `describeChance` documents. Not
 *  exported: `EncounterGutter.tsx`'s own `describeChance` isn't either, and
 *  this file's own exported-pure-helper list (spec's own "Keep the pure
 *  helpers exported and unit-tested") names only `matchesTime`/`rowLabel`/
 *  `chipText`. */
function chipTooltip(chance: GbcEncounterChance, method: GbcEncounterMethod): string {
  const buff = method === "grass" || method === "water" ? "+" : "";
  return `${displaySpeciesName(chance.species)} · Lv ${chance.minLevel}-${chance.maxLevel}${buff} · ${chance.percent.toFixed(1)}%`;
}

/** A row's own encounter-roll rate, or fishing bite chance -- "12.5%" (spec's
 *  own example), one decimal. `null` when a source has neither (headbutt). */
function rateText(source: GbcEncounterSource): string | null {
  if (source.encounterRate !== undefined) return `${source.encounterRate.toFixed(1)}%`;
  if (source.biteChance !== undefined) return `${source.biteChance.toFixed(1)}%`;
  return null;
}

/** Stable identity for a row -- method alone is not unique (fishing can
 *  contribute up to 6 rows for the same map: 3 rods x up to 2 times). */
function rowKey(source: GbcEncounterSource): string {
  return [source.method, source.time ?? "", source.rod ?? "", source.list ?? ""].join(":");
}

/** Every source that matches the app's current time, grouped in the spec's
 *  own fixed order (grass, water, fish, headbutt, rock) -- a STABLE sort
 *  (`Array.prototype.sort` is stable per spec since ES2019), so multiple
 *  sources of the same method (grass morn/day/nite, 3 fishing rods) keep
 *  their own original relative order within that group. */
function orderedRows(sources: GbcEncounterSource[], time: GbcTimeOfDay): GbcEncounterSource[] {
  return sources.filter((s) => matchesTime(s, time)).sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
}

/** Distinct species across every (time-filtered) row a map has -- what the
 *  low-zoom badge counts. Mirrors `EncounterGutter.tsx`'s own
 *  `distinctSpeciesCount`. */
function distinctSpeciesCount(rows: GbcEncounterSource[]): number {
  const seen = new Set<string>();
  for (const row of rows) for (const c of row.chances) seen.add(c.species);
  return seen.size;
}

/** At and above this many screen px per world BLOCK, per-species chips are
 *  legible; below it a map's strip collapses to a plain species-count badge.
 *  Deliberately an independent literal, not an import of
 *  `GbcWorldCanvas.tsx`'s own `GBC_LOD_ZOOM_THRESHOLD` (`= 8`) -- importing
 *  it would create a cycle, since `GbcWorldCanvas` is the one that mounts
 *  this component. Mirrors `EncounterGutter.tsx`'s own identical situation
 *  with `WorldCanvas.tsx`'s unexported `LOD_ZOOM_THRESHOLD`: this comment is
 *  the tether between the two numbers instead of a shared import. */
const LOW_ZOOM_THRESHOLD = 8;

/** Chips shown per row before truncating to "+N more" -- mirrors
 *  `EncounterGutter.tsx`'s own `ICON_CAP`. `chances` is already sorted by
 *  percent descending (every `GbcEncounterSource` builder in `atlas.ts`
 *  sorts its own merged chances that way), so what's shown is always the
 *  most likely species. */
const CHIP_CAP = 6;

interface TooltipState {
  key: string;
  label: string;
  x: number;
  y: number;
}

export function GbcEncounterGutter({ maps, zoom, time }: GbcEncounterGutterProps) {
  const [enabled, setEnabled] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const collapsed = zoom < LOW_ZOOM_THRESHOLD;

  // Top-level-sibling tooltip, positioned from the hovered/focused chip's own
  // getBoundingClientRect() at hover time -- EncounterGutter.tsx's own
  // showTooltip/hideTooltip pattern, verbatim (see this file's own header
  // comment for why nesting the tooltip inside the chip/strip is wrong).
  const showTooltip = (e: { currentTarget: HTMLElement }, key: string, label: string) => {
    const chipRect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    setTooltip({
      key,
      label,
      x: chipRect.left - (containerRect?.left ?? 0) + chipRect.width / 2,
      y: chipRect.top - (containerRect?.top ?? 0),
    });
  };
  const hideTooltip = (key: string) => setTooltip((t) => (t?.key === key ? null : t));

  // Clears any stale tooltip whenever the thing it was anchored to might
  // have moved, disappeared, or gone out of scope -- EncounterGutter.tsx's
  // own useLayoutEffect, verbatim reasoning, plus `time` (a time switch can
  // remove the very row a tooltip was anchored to, e.g. a grass-morn row
  // stops matching at Day).
  useLayoutEffect(() => {
    setTooltip(null);
  }, [enabled, collapsed, zoom, maps, time]);

  return (
    <div className="encounter-gutter" ref={containerRef}>
      <div className="encounter-gutter__control">
        <button type="button" className="encounter-gutter__toggle" aria-pressed={enabled} onClick={() => setEnabled((e) => !e)}>
          Encounters
        </button>

        {enabled && (
          <div className="encounter-gutter__legend" role="note">
            <p className="encounter-gutter__legend-title">Encounter gutter</p>
            <p className="encounter-gutter__legend-body">
              Species chips along each map&rsquo;s edge, grouped by method &mdash; grass tagged by time of day, fishing
              further split into Old, Good and Super Rod rows. Hover or focus a chip for its species, level range and
              true catch percentage. A trailing + on a grass/water level marks the runtime +0-4 encounter-level buff.
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
              Zoomed out, a map shows just its species count &ndash; zoom in to see and hover individual chips.
            </p>
          </div>
        )}
      </div>

      {enabled &&
        maps.map((entry) => {
          if (!entry.sources) return null; // still loading -- nothing to show yet
          const rows = orderedRows(entry.sources, time);
          if (rows.length === 0) return null; // no (matching) encounters here -- a normal state, not a gap

          const left = entry.rect.x;
          const top = entry.rect.y + entry.rect.height + 4;

          if (collapsed) {
            const count = distinctSpeciesCount(rows);
            return (
              <div key={entry.map} className="encounter-gutter__badge" style={{ left, top }}>
                {entry.map} &middot; {count} species
              </div>
            );
          }

          return (
            <div key={entry.map} className="encounter-gutter__strip" style={{ left, top }}>
              {rows.map((source) => {
                const shown = source.chances.slice(0, CHIP_CAP);
                const rate = rateText(source);
                return (
                  <div className="encounter-gutter__row" key={rowKey(source)}>
                    <span className={`encounter-gutter__method-tag encounter-gutter__method-tag--${METHOD_SLUG[source.method]}`}>
                      {rowLabel(source)}
                    </span>
                    {rate && <span className="encounter-gutter__rate">{rate}</span>}
                    <div className="encounter-gutter__icons">
                      {shown.map((c) => {
                        const key = `${entry.map}:${rowKey(source)}:${c.species}`;
                        const label = chipTooltip(c, source.method);
                        return (
                          <button
                            type="button"
                            key={c.species}
                            className="encounter-gutter__chip"
                            onMouseEnter={(e) => showTooltip(e, key, label)}
                            onMouseLeave={() => hideTooltip(key)}
                            onFocus={(e) => showTooltip(e, key, label)}
                            onBlur={() => hideTooltip(key)}
                          >
                            {chipText(c, source.method)}
                          </button>
                        );
                      })}
                      {source.chances.length > CHIP_CAP && (
                        <span className="encounter-gutter__more">+{source.chances.length - CHIP_CAP}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

      {enabled && !collapsed && tooltip && (
        <span className="encounter-gutter__tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.label}
        </span>
      )}
    </div>
  );
}
