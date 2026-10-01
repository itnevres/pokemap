import { useLayoutEffect, useRef, useState } from "react";
import { bandRect, type BorderSide, type Rect } from "../encounters/borderSide.js";
import type { SpeciesRow, SpeciesSummary } from "../encounters/summary.js";
import type { GbcTimeOfDay } from "../gbc/time.js";

export interface EncounterBorderEntry {
  map: string;
  /** Screen-px rect of the map (the caller's own pan/zoom math). */
  rect: Rect;
  /** Which side of `rect` the band sits on (B2's `pickBorderSide`). */
  side: BorderSide;
  /** `undefined` = still loading, `[]` = no encounters: both render nothing. */
  summaries: SpeciesSummary[] | undefined;
}

export interface EncounterBorderProps {
  entries: EncounterBorderEntry[];
  /** Screen px per world unit (GBA metatile / GBC block). */
  zoom: number;
  /** Below this zoom a map shows a count badge instead of sprites (GBA 4, GBC 8). */
  lodZoom: number;
  /** Band thickness in world units (`BORDER_BAND.gba` / `.gbc`). */
  band: number;
  /** GBC app time; absent for GBA, where nothing is ever dimmed. */
  time?: GbcTimeOfDay;
  /**
   * Controlled mode (B4, the single-map views). `undefined` = this component owns its `Encounters`
   * toggle and legend (the world views). Defined = it renders neither: the caller owns both, and this
   * alone decides whether strips, badges and tooltips render.
   */
  enabled?: boolean;
}

/** Sprites never grow past the 32 px source frame; below that they fill the band. */
const SPRITE_MAX_PX = 32;

/** One decimal, a trailing ".0" dropped: 45 -> "45%", 64.84375 -> "64.8%". */
const fmtPct = (p: number): string => `${Math.round(p * 10) / 10}%`;

const fmtLevel = (r: SpeciesRow): string =>
  `Lv ${r.minLevel === r.maxLevel ? r.minLevel : `${r.minLevel}-${r.maxLevel}`}${r.levelBuff ? "+" : ""}`;

function rowLine(r: SpeciesRow): string {
  const rate = r.rate === undefined ? "" : ` · ${r.method === "fish" ? "bite" : "rate"} ${fmtPct(r.rate)}`;
  return `${r.label} ${fmtPct(r.percent)} ${fmtLevel(r)}${rate}`;
}

/** GBC only: the species is live at some time of day, but not the current one. */
const isDimmed = (s: SpeciesSummary, time: GbcTimeOfDay | undefined): boolean =>
  time !== undefined && s.availableAt !== undefined && !s.availableAt.includes(time);

/**
 * The tooltip's lines: the name, one line per row in row order, a `+` legend
 * when any row carries the level buff, and -- only when `time` is given and
 * the species is dimmed at it -- "Not encountered at <time>".
 */
export function tooltipLines(s: SpeciesSummary, time?: GbcTimeOfDay): string[] {
  const lines = [s.displayName, ...s.rows.map(rowLine)];
  if (s.rows.some((r) => r.levelBuff)) lines.push("+ = level can roll up to 4 higher");
  if (isDimmed(s, time)) lines.push(`Not encountered at ${time}`);
  return lines;
}

/** A hovered/focused sprite's tooltip plus WHERE to anchor it, computed once at
 *  hover time (see showTooltip) rather than tracked as a CSS-relative child. */
interface TooltipState {
  key: string;
  lines: string[];
  x: number;
  y: number;
}

const px = (n: number): string => `${n}px`;
const rectStyle = (r: Rect) => ({ left: px(r.x), top: px(r.y), width: px(r.width), height: px(r.height) });

/**
 * Encounter border (Plan 6c B3): one sprite per species on a free side of each
 * map, replacing the old per-family gutters. Off by default behind one toggle;
 * the legend only exists while it is on. Purely presentational and
 * family-blind: the caller supplies screen rects, the side per map and the
 * `SpeciesSummary[]` (B1). Mounted once over a `position: relative` viewport;
 * the root is `pointer-events: none` so it never steals canvas pans, and only
 * the toggle, legend, sprites and `+N` chips opt back in.
 */
export function EncounterBorder({ entries, zoom, lodZoom, band, time, enabled: controlled }: EncounterBorderProps) {
  const [ownEnabled, setEnabled] = useState(false);
  const enabled = controlled ?? ownEnabled;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // Only for reading the root's live screen rect in showTooltip.
  const containerRef = useRef<HTMLDivElement>(null);

  const collapsed = zoom < lodZoom;
  const bandPx = band * zoom;
  const spritePx = Math.min(SPRITE_MAX_PX, bandPx);

  // Review fix (carried over from the old gutters): the tooltip is a top-level
  // sibling, never a child of the sprite. Nested, it sat inside the strip's
  // (and the hovered sprite's) stacking context, which traps z-index, so it
  // could never paint above the legend. Anchored from the sprite's
  // getBoundingClientRect() read at event time, like WorldCanvas's own
  // tooltip (grep `getBoundingClientRect` in WorldCanvas.tsx).
  // `what` is one species (its full tooltip) or the hidden species behind a
  // "+N" chip (their names); the lines are built here, once per event, not per
  // sprite per render.
  const showTooltip = (e: { currentTarget: HTMLElement }, key: string, what: SpeciesSummary | SpeciesSummary[]) => {
    const lines = Array.isArray(what) ? what.map((h) => h.displayName) : tooltipLines(what, time);
    const spriteRect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    setTooltip({
      key,
      lines,
      x: spriteRect.left - (containerRect?.left ?? 0) + spriteRect.width / 2,
      y: spriteRect.top - (containerRect?.top ?? 0),
    });
  };
  // Clears only its own key: moving straight from one sprite to the next fires
  // leave(old) after enter(new), which must not wipe the new tooltip.
  const hideTooltip = (key: string) => setTooltip((t) => (t?.key === key ? null : t));

  // Review fix (carried over): hover/blur alone do not fire when the sprite
  // moves, unmounts, or the whole overlay is switched off under it. Seen live:
  // (1) a wheel zoom that never crosses the LOD threshold moves every sprite
  // each frame while the tooltip's captured x/y stays put; (2) crossing the
  // threshold unmounts the sprite; (3) toggling off left it floating over the
  // bare canvas. The render guard below covers (2) and (3) for the one render
  // before this runs, but only clearing the STATE covers (1) -- and keeps a
  // later toggle-on from resurrecting a stale tooltip. `entries` changes on
  // every pan/zoom frame; `time` can remove the dimmed line the tooltip shows.
  // useLayoutEffect so the stale position never paints.
  useLayoutEffect(() => {
    setTooltip(null);
  }, [enabled, collapsed, zoom, entries, time]);

  return (
    <div className="encounter-border" ref={containerRef}>
      {controlled === undefined && (
        <div className="encounter-border__control">
          <button type="button" className="encounter-border__toggle" aria-pressed={enabled} onClick={() => setEnabled((e) => !e)}>
            Encounters
          </button>

          {enabled && (
            <div className="encounter-border__legend" role="note">
              <p className="encounter-border__legend-title">Encounter border</p>
              <p className="encounter-border__legend-body">
                One sprite per species, on a free side of each map. Hover or focus a sprite for its levels and true catch
                chances.
              </p>
              {time !== undefined && (
                <>
                  <p className="encounter-border__legend-body">
                    <span className="encounter-border__legend-sample" /> Dimmed with a dashed outline: not encountered at
                    the current time of day.
                  </p>
                  <p className="encounter-border__legend-body">
                    A + after a level: the runtime +0-4 level buff on grass and surf.
                  </p>
                </>
              )}
              <p className="encounter-border__legend-hint">
                Zoomed out, a map shows just its species count &ndash; zoom in to see and hover individual sprites.
              </p>
            </div>
          )}
        </div>
      )}

      {enabled &&
        entries.map((entry) => {
          const list = entry.summaries;
          if (!list || list.length === 0) return null; // loading, or no encounters here: nothing to show
          const area = bandRect(entry.rect, entry.side, bandPx);

          if (collapsed) {
            // The map name must be in the badge's own visible text: it is
            // pointer-events: none, so a `title` could never show, and with
            // dozens of pills on screen nothing else says which map one is.
            return (
              <div key={entry.map} className={`encounter-border__badge encounter-border__badge--${entry.side}`} style={rectStyle(area)}>
                <span className="encounter-border__badge-text">
                  {entry.map} &middot; {list.length} species
                </span>
              </div>
            );
          }

          const sideLen = entry.side === "left" || entry.side === "right" ? entry.rect.height : entry.rect.width;
          const k = Math.max(1, Math.floor(sideLen / spritePx));
          const shown = list.length > k ? list.slice(0, k - 1) : list;
          const hidden = list.length - shown.length;

          return (
            <div key={entry.map} className={`encounter-border__strip encounter-border__strip--${entry.side}`} style={rectStyle(area)}>
              {shown.map((s) => {
                const key = `${entry.map}:${s.species}`;
                const dimmed = isDimmed(s, time);
                return (
                  <button
                    type="button"
                    key={s.species}
                    className={`encounter-border__sprite${dimmed ? " encounter-border__sprite--dimmed" : ""}`}
                    style={{ width: px(spritePx), height: px(spritePx) }}
                    // Dimming is also in the accessible name, not just the tooltip.
                    aria-label={dimmed ? `${s.displayName}, not encountered at ${time}` : s.displayName}
                    onMouseEnter={(e) => showTooltip(e, key, s)}
                    onMouseLeave={() => hideTooltip(key)}
                    onFocus={(e) => showTooltip(e, key, s)}
                    onBlur={() => hideTooltip(key)}
                  >
                    <img
                      src={s.iconUrl}
                      alt=""
                      width={spritePx}
                      height={spritePx}
                      loading="lazy"
                      // Icon art is read-only data this tool does not control: a
                      // species whose icon 404s should not scar the strip with
                      // the browser's broken-image glyph. The button's
                      // aria-label still names it.
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </button>
                );
              })}
              {hidden > 0 && (
                // A real button: the hidden species are otherwise unreachable by
                // hover, focus or assistive tech. Its tooltip lists their names.
                <button
                  type="button"
                  className="encounter-border__more"
                  style={{ width: px(spritePx), height: px(spritePx) }}
                  aria-label={`${hidden} more species`}
                  onMouseEnter={(e) => showTooltip(e, `${entry.map}:+`, list.slice(shown.length))}
                  onMouseLeave={() => hideTooltip(`${entry.map}:+`)}
                  onFocus={(e) => showTooltip(e, `${entry.map}:+`, list.slice(shown.length))}
                  onBlur={() => hideTooltip(`${entry.map}:+`)}
                >
                  +{hidden}
                </button>
              )}
            </div>
          );
        })}

      {/* Top-level sibling, not inside any strip (see showTooltip). The
          `enabled && !collapsed` guard is belt-and-braces beside the layout
          effect: it makes the stale tooltip unrenderable during the one pass
          between a state flip and the effect reacting to it. */}
      {enabled && !collapsed && tooltip && (
        <span className="encounter-border__tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.lines.map((line, i) => (
            <span key={i} className="encounter-border__tooltip-line">
              {line}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
