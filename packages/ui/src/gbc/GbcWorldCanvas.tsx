import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component, Conflict, Bounds } from "@pokemap/core/src/gbc/world/connections.js";
import type { GbcWorldPayload, GbcWorldPlacement } from "@pokemap/core/src/gbc/wire.js";
import type { GbcEncounterSource, GbcSpeciesHit } from "@pokemap/core/src/gbc/analyse/atlas.js";
import { computeFit, drawDiamond, levelColorMap } from "../components/WorldCanvas.js";
import { LensPanel, LensLegend, type LensId, type LensPanelSummary } from "../components/LensPanel.js";
import { SpeciesSpotlight } from "../components/SpeciesSpotlight.js";
import { EncounterBorder, type EncounterBorderEntry } from "../components/EncounterBorder.js";
import { BORDER_BAND, pickBorderSide, type BorderSide, type Rect } from "../encounters/borderSide.js";
import { summariseGbc, type SpeciesSummary } from "../encounters/summary.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import { useGbcCoverage } from "./hooks/useGbcCoverage.js";
import { isGbcEncountersPayload } from "./guards.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import type { GbcTimeOfDay } from "./time.js";

/**
 * The read-only GBC world view (Plan 6b Task 5). Mirrors `WorldCanvas.tsx`'s
 * own pan/zoom/viewport/culling/LOD mechanics, for the same reason
 * `GbcMapCanvas.tsx`'s own header comment does it for `MapCanvas.tsx` --
 * these are this project's postmortems, not style preferences. Cited by a
 * grep-able anchor phrase rather than a line number (fix round, quality
 * review Important #1: every hand-counted line range here was wrong from
 * the day it was written, and `WorldCanvas.tsx` is exactly the file Task 6
 * edits next, so a stale number sends a future reader to the wrong feature
 * entirely):
 * - `viewport` MUST stay in the draw effect's own dependency list
 *   (`WorldCanvas.tsx`'s own `// Measure the viewport` comment, the Task 21
 *   canvas-blanking postmortem).
 * - A native `wheel` listener, `{ passive: false }` (`WorldCanvas.tsx`'s own
 *   "React attaches wheel listeners as passive by default" comment) --
 *   React's own `onWheel` is passive, so `preventDefault()` inside it is a
 *   silent no-op and the page scrolls under the canvas.
 * - Culling via the `intersects` AABB test (`WorldCanvas.tsx`'s own
 *   top-level `intersects` function): only a placement whose tile-rect
 *   intersects the viewport is drawn, fetched, or hit-testable.
 * - Images load per visible placement only, cached by ref (never refetched
 *   once cached), with a `compositeVersion` bump when each arrives
 *   (`WorldCanvas.tsx`'s own "Load (and cache) the source image for every
 *   visible placement" comment), plus a downscaled `small` canvas at
 *   `LOD_SCALE` for the LOD path.
 * - Conflict badges: `drawDiamond` (exported additively from
 *   `WorldCanvas.tsx`, Plan 6b Task 5) at the offending map's top-right
 *   corner, plus a hit-rect recorded for a floating hover tooltip
 *   (`WorldCanvas.tsx`'s own "Conflicts: a diamond at the offending map's
 *   top-right corner" comment).
 * - The map-list jump (`jumpToMap`/`jumpToken`) and its fading outline
 *   (`WorldCanvas.tsx`'s own jump effect + its separately-scoped fade
 *   effect just below it, and the "keyed on jumpToken (not jumpToMap)"
 *   comment on the highlight's own `key` prop -- the "jumpHighlight"
 *   pattern).
 *
 * **Fix round (spec review F5): nothing loads or culls before the initial
 * fit has actually been applied.** `view.fitted` is part of the single view
 * state (set together with `zoom`/`pan` in the very same `setView` call that
 * performs the fit), and `visible` returns `[]` while it is false. Before
 * this fix, `visible`/the image-load effect ran once against the MOUNT
 * default (`zoom: 1, pan: {0,0}`) in the same commit `/api/world` resolved,
 * before the fit effect's `setView` had run -- at zoom 1 that "viewport"
 * covers nearly the whole world, so the very first World-mode mount fetched
 * and decoded ~308 of 391 map renders (measured live), not the ~80 the fit
 * actually shows. (An earlier draft of this comment claimed the opposite --
 * "the very first render never loads more than what culling already shows"
 * -- which was false; this paragraph replaces that claim.)
 *
 * **Lessons from Task 4, applied here too (binding, `task-4-spec-review.md`
 * findings A/B):**
 * - **One `view: { zoom, pan }` state, updated by a single pure function.**
 *   GBA's own `MapCanvas.tsx:532-542` (and, before its own fix round,
 *   `GbcMapCanvas.tsx`'s first draft) nested a `setPan` call inside a
 *   `setZoom` updater -- harmless outside `<StrictMode>`, but `main.tsx`
 *   wraps the whole app in it, and React double-invokes updater functions
 *   there, applying the nested update twice (2x zoom lands off-centre, 4x
 *   goes fully off-canvas). Unlike `GbcMapCanvas`'s own STEPPED
 *   `zoomAboutPivot` (1x/2x/4x), the world's zoom is CONTINUOUS
 *   (`WHEEL_FACTOR`-multiplied, `WorldCanvas.tsx`'s own "React attaches
 *   wheel listeners as passive by default" comment area), so
 *   `zoomWorldAboutPivot` below mirrors that continuous math instead of
 *   copying `GbcMapCanvas.tsx`'s stepped version verbatim -- both are pure,
 *   single-state-returning functions for the identical StrictMode reason.
 * - **`useGuardedFetch`'s per-URL reset doesn't matter here**: `useGbcWorld`
 *   fetches a single fixed URL (`/api/world` never changes), so there is no
 *   stale-payload-under-a-new-name risk `GbcMapCanvas`'s own `useGbcMap`
 *   had to guard against.
 * - **Take screenshots only after images have loaded**; a "blank" GBC world
 *   view is very likely a real bug given the fix-round precedent (a stale
 *   fit from the wrong map, or a not-yet-resolved fetch) -- instrument
 *   `drawImage` before explaining one away.
 *
 * GBC-specific, and out of scope entirely (plan Q2, "GBA-only features"):
 * no drag-to-place, no multi-select move, no dungeon auto-layout toggle, no
 * warp markers/connection lines, no sidecar POSTs. Selection is a plain
 * single click (`onSelectMap`); double-click opens the map in Map view
 * (`onOpenMap`) rather than a warp destination modal.
 */

/** Native block size, px (`GbcWorldPayload.blockPx`, always 32). Zoom here
 *  is screen px PER BLOCK, not per tile -- see `computeFit`'s own
 *  `zoomBounds` doc comment for why GBA's `MAX_ZOOM` (a px/tile cap) is the
 *  wrong unit for this canvas. */
const BLOCK_PX = 32;

const GBC_MIN_ZOOM = 1 / 64;
const GBC_MAX_ZOOM = 32;
/** Passed to every `computeFit` call in this file -- GBC's zoom unit is
 *  screen px per BLOCK (native 32), not per tile (WorldCanvas.tsx's own
 *  MIN_ZOOM/MAX_ZOOM are a px/TILE cap of 16, which would silently limit a
 *  GBC fit to half native resolution). */
const GBC_ZOOM_BOUNDS = { min: GBC_MIN_ZOOM, max: GBC_MAX_ZOOM };

/** Continuous zoom step per wheel notch, same constant and same
 *  multiplicative mechanic as `WorldCanvas.tsx`'s own `WHEEL_FACTOR`
 *  (`WorldCanvas.tsx`'s own `const WHEEL_FACTOR = 1.2;` declaration) --
 *  GBC's world zoom is continuous, unlike
 *  `GbcMapCanvas`'s own stepped 1x/2x/4x. */
const WHEEL_FACTOR = 1.2;

/** Fraction of native resolution the cached LOD buffer renders at --
 *  identical to `WorldCanvas.tsx`'s own `LOD_SCALE`. */
const LOD_SCALE = 0.25;

/** Below this many screen px per BLOCK, redraw from the downscaled `small`
 *  buffer rather than the full-resolution source image. GBA's own
 *  `LOD_ZOOM_THRESHOLD` is `4` = `16` (`TILE_PX`, GBA's native px/tile) *
 *  `LOD_SCALE`; GBC's block is 32px native, so its threshold is
 *  `32 * LOD_SCALE` = `8`, computed from the same named constants rather
 *  than a second unexplained literal. */
export const GBC_LOD_ZOOM_THRESHOLD = BLOCK_PX * LOD_SCALE; // 8

const BADGE_SIZE = 10;

/** "Fills about 60% of the viewport" (Task 5 spec's own jump wording) --
 *  distinct from `WorldCanvas.tsx`'s own map-list jump, which fits the
 *  target map at 100% via a bare `computeFit` call. A GBC map is usually
 *  much smaller relative to its neighbours than a GBA one is to the full
 *  1,209-map world, so landing at 100% would zoom in tight enough to lose
 *  all surrounding context (neighbouring maps, a conflict badge on an
 *  adjacent route); 60% leaves a visible margin. */
const JUMP_FILL_FRACTION = 0.6;

/** Same fade duration as `WorldCanvas.tsx`'s own jump highlight
 *  (`world-canvas-jump-fade`, `styles.css`). */
const JUMP_HIGHLIGHT_MS = 2000;

/** The canvas's whole pan/zoom state, updated as ONE value -- see the
 *  header comment's StrictMode citation. `fitted` (fix round, F5) is part
 *  of this same state, not a separate one, precisely so the initial fit's
 *  `setView` can set the real zoom/pan AND flip `fitted` to true in one
 *  atomic update -- never a render where `fitted` is already true but
 *  `zoom`/`pan` are still the stale mount default, or vice versa. */
export interface GbcWorldView {
  zoom: number;
  pan: { x: number; y: number };
  fitted: boolean;
}

/**
 * Pure: given the current view, a multiplicative zoom factor (`>1` in,
 * `<1` out), and a pivot point in stage-canvas pixels, returns the view
 * that keeps the world-space point under the pivot fixed on screen --
 * clamped to `bounds` (default `GBC_ZOOM_BOUNDS`) -- or the SAME `view`
 * object when the clamped result doesn't actually change the zoom, so a
 * caller can use reference equality to skip work. `fitted` is carried over
 * unchanged (spread from `view`): a wheel zoom or a keyboard zoom never
 * itself flips it. Exported and unit-tested with exact numbers, called from
 * exactly one `setView(v => zoomWorldAboutPivot(v, ...))` site per caller
 * (see the header comment's StrictMode reasoning).
 */
export function zoomWorldAboutPivot(
  view: GbcWorldView,
  factor: number,
  pivotX: number,
  pivotY: number,
  bounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
): GbcWorldView {
  const next = Math.min(bounds.max, Math.max(bounds.min, view.zoom * factor));
  if (next === view.zoom) return view;
  const cx = (pivotX - view.pan.x) / view.zoom;
  const cy = (pivotY - view.pan.y) / view.zoom;
  return { ...view, zoom: next, pan: { x: pivotX - cx * next, y: pivotY - cy * next } };
}

/** AABB test in world-block space -- copied from `WorldCanvas.tsx`'s own
 *  `intersects` (not imported: that file exports it as a plain, unexported
 *  local function, and duplicating one four-line predicate is simpler than
 *  making it a second additive export). */
function intersects(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return !(px + pw <= x0 || px >= x1 || py + ph <= y0 || py >= y1);
}

/**
 * The union of every MULTI-map component's own bounds (`.maps.length > 1`)
 * -- the "3 landmasses" a corpus this size actually has, excluding the 323
 * single-map interiors that make up most of the 255x746-block canvas (Task
 * 5 spec's own corpus facts). `null` when there are none (an empty/all-
 * singleton world), so the caller can fall back to `fitAllBounds`. Pure,
 * reading only `component.bounds` (already computed by `buildGbcWorld`) --
 * no placement lookup needed, unlike GBA's own `worldBoundsOf`, which has
 * to reconstruct an orphan's size from a separate `sizeByMap` map that GBC
 * has no equivalent of (every GBC placement already carries its own real
 * width/height, Task 2's own wire shape).
 */
export function initialFitBounds(world: { components: readonly Component[] }): Bounds | null {
  const multi = world.components.filter((c) => c.maps.length > 1);
  if (multi.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of multi) {
    x0 = Math.min(x0, c.bounds.x);
    y0 = Math.min(y0, c.bounds.y);
    x1 = Math.max(x1, c.bounds.x + c.bounds.width);
    y1 = Math.max(y1, c.bounds.y + c.bounds.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The union of every placement's own bounds -- "Fit all" (Task 5 spec).
 *  `null` for an empty world. */
export function fitAllBounds(placements: Record<string, Placement>): Bounds | null {
  const list = Object.values(placements);
  if (list.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) {
    if (p.width <= 0 || p.height <= 0) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.width);
    y1 = Math.max(y1, p.y + p.height);
  }
  if (x0 === Infinity) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The CLI's own `noteLines` wording (`packages/cli/src/gbcCommands.ts`,
 * `noteLines`), reused verbatim rather than re-derived: `${map} placed via
 * ${viaB.from}; ${viaA.from} disagrees by (dx,dy)`, `dx,dy = viaA - viaB`.
 * For the real Route17 fixture (`viaA: {from: "Route18", x:30,y:50}`,
 * `viaB: {from: "Route16", x:30,y:49}`): "Route17 placed via Route16;
 * Route18 disagrees by (0,1)" -- re-measured directly against the live
 * corpus's `buildGbcWorld` output, not copied from the spec's prose.
 */
export function conflictTooltipText(c: Conflict): string {
  const dx = c.viaA.x - c.viaB.x;
  const dy = c.viaA.y - c.viaB.y;
  return `${c.map} placed via ${c.viaB.from}; ${c.viaA.from} disagrees by (${dx},${dy})`;
}

/** Pure LOD chooser -- the mutation the spec names explicitly ("use an LOD
 *  threshold of 4", GBA's own value) must fail against a zoom strictly
 *  between the two thresholds (4 <= zoom < 8). */
export function shouldUseLod(zoom: number): boolean {
  return zoom < GBC_LOD_ZOOM_THRESHOLD;
}

/**
 * The method lens's own per-map tint colour (Plan 6b Task 6) -- a fixed
 * display PRECEDENCE (spec's own "water > fish > headbutt > rock") for a map
 * whose sources include more than one non-grass method, not a ranking of
 * importance; mirrors `WorldCanvas.tsx`'s own `methodTintFor` exactly (same
 * "first match wins" shape, one CSS var per method). Grass is never tinted
 * (spec's own "Grass is never a tint" -- it's a lens about which maps reward
 * a specific ACTION beyond walking through grass, which every encounter-
 * carrying map already does). `sources` is `undefined` while the map's own
 * `/api/encounters` fetch hasn't resolved yet (nothing to tint YET, not "no
 * tint ever" -- this memo re-runs once it lands) and `[]` for a map with no
 * encounters at all (also nothing to tint, correctly).
 *
 * A fish source counts only if it's present in the ALREADY-FETCHED sources
 * for this map -- the server already drops fishing on a waterless map (the
 * Task 12 atlas rule, cited in the spec's own "no extra client logic"
 * note), so there is nothing further to check here.
 *
 * Exported and unit-tested for every precedence combination, including
 * mutation check #3 (swapping fish and water in the precedence order).
 */
export function methodTint(sources: GbcEncounterSource[] | undefined): string | null {
  if (!sources) return null;
  if (sources.some((s) => s.method === "water")) return "var(--encounter-water)";
  if (sources.some((s) => s.method === "fish")) return "var(--encounter-fishing)";
  if (sources.some((s) => s.method === "headbutt")) return "var(--encounter-headbutt)";
  if (sources.some((s) => s.method === "rock")) return "var(--encounter-rock-smash)";
  return null;
}

/** `LensLegend`'s own `methodKey` for the GBC method lens (spec's own list,
 *  and the coordinator's swatch-slug amendment: only "water", "fishing",
 *  "headbutt" and "rock-smash" -- grass is never in this key, since it's
 *  never tinted; see `methodTint`'s own doc comment). Module scope, not
 *  recreated per render -- `LensLegend`'s own `methodKey` prop is read by
 *  reference identity nowhere that matters (a plain render-time read), but
 *  there is no reason to allocate a fresh array every render either. */
const GBC_METHOD_LENS_KEY: Array<{ slug: string; label: string }> = [
  { slug: "water", label: "Water (surfing)" },
  { slug: "fishing", label: "Fish" },
  { slug: "headbutt", label: "Headbutt" },
  { slug: "rock-smash", label: "Rock Smash" },
];

/** `LensLegend`'s own `legendCopy` override for the GBC lens legend (spec's
 *  own exact copy for level-curve and method; empty-maps/unused-species are
 *  left at `LensLegend`'s own GBA defaults, which already read generically
 *  off `summary` and need no GBC-specific wording). Module scope, for the
 *  same reason as `GBC_METHOD_LENS_KEY` above. */
const GBC_LEGEND_COPY: Partial<Record<LensId, (s: LensPanelSummary) => string>> = {
  "level-curve": () =>
    "Colour is the average encounter level: an unweighted mean of each source's average. Blue is low, red is high.",
  method: () => "Which maps reward surfing, fishing, headbutting trees or rock smash.",
};

interface FitResult {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * The map-list jump's own fit: the UNCLAMPED "fits entirely" zoom
 * (`min(viewport.w/bounds.width, viewport.h/bounds.height)`) is scaled down
 * by `fraction` (default `JUMP_FILL_FRACTION`) FIRST, and only THEN clamped
 * to `zoomBounds` -- "fills about 60% of the viewport", not "fits exactly".
 * Exported and unit-tested directly.
 *
 * Fix round (spec review F2): this used to clamp before scaling (`computeFit
 * (...).zoom * fraction`), which is wrong whenever the unclamped fit exceeds
 * `zoomBounds.max` -- most real GBC maps at a real viewport size. A 20x18
 * map (e.g. OlivineCity) in a 1000x668 viewport has an unclamped fit of
 * ~37.1 px/block; clamping that to 32 FIRST and then taking 60% lands at
 * 19.2 (a 0.52 fill, confirmed live), not the intended 0.6. Scaling first
 * (37.1 * 0.6 = 22.27, well under the 32 cap so the clamp is a no-op here)
 * gives the correct 0.6 fill.
 */
export function jumpFit(
  bounds: Bounds,
  viewport: { w: number; h: number },
  zoomBounds: { min: number; max: number } = GBC_ZOOM_BOUNDS,
  fraction: number = JUMP_FILL_FRACTION,
): FitResult {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const rawZoom = Math.min(viewport.w / bounds.width, viewport.h / bounds.height);
  const zoom = Math.min(zoomBounds.max, Math.max(zoomBounds.min, rawZoom * fraction));
  return {
    zoom,
    pan: {
      x: -bounds.x * zoom + (viewport.w - bounds.width * zoom) / 2,
      y: -bounds.y * zoom + (viewport.h - bounds.height * zoom) / 2,
    },
  };
}

interface ImageCacheEntry {
  loaded: boolean;
  img?: HTMLImageElement;
  small?: HTMLCanvasElement;
}

/** Mirrors `ImageCacheEntry`'s own shape and reasoning: a placeholder
 *  written synchronously before the fetch starts, so a second effect run for
 *  the same map never double-fetches. Unlike the image cache, this one is
 *  TIME-INDEPENDENT (spec's own "one fetch per map, ever" -- see the fetch
 *  effect's own comment below): `sources` holds every method/time/rod/list
 *  variant a map has, and time filtering happens client-side, at render,
 *  inside `EncounterBorder` (dimming)/`methodTint` -- never by refetching on a time
 *  switch. `sources` stays unset on a failed fetch (mirrors the image
 *  cache's own best-effort posture: one map's border/tint entry just stays
 *  empty, not a banner over an otherwise-working canvas). */
interface EncounterCacheEntry {
  loaded: boolean;
  sources?: GbcEncounterSource[];
  /** `summariseGbc(sources)`, built once on arrival (time-independent: the
   *  component dims by time, it never filters). */
  summaries?: SpeciesSummary[];
}

interface HoverInfo {
  map: string;
  component: Component | null;
  width: number;
  height: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  text: string;
}

type DragState =
  | { kind: "pan"; x: number; y: number; panX: number; panY: number }
  | { kind: "map"; map: string; grabX: number; grabY: number; startX: number; startY: number; x: number; y: number }
  | null;

export interface GbcWorldCanvasProps {
  time: GbcTimeOfDay;
  /** A map name to jump to, or null/undefined for none -- mirrors
   *  `WorldCanvas.tsx`'s own `jumpToMap` (`GbcApp`'s tree clicks). */
  jumpToMap?: string | null;
  /** Bumped on every tree click, even a re-click of the same name --
   *  `jumpToMap` alone can't tell "jump here again" from "no change". */
  jumpToken?: number;
  /** Fired when a single click hits a placement -- `GbcApp` uses this to
   *  keep the sidebar tree's own highlight in sync with the canvas. */
  onSelectMap?: (name: string) => void;
  /** Fired when a double-click hits a placement -- `GbcApp` switches to Map
   *  view with that map selected. */
  onOpenMap?: (name: string) => void;
  /** A lens list entry (Empty maps) was clicked; the app selects the map and
   *  jumps there (the tree-click path). */
  onJumpToMap?: (name: string) => void;
}

/**
 * The stitched GBC world: all 391 maps culled to the viewport, panned and
 * zoomed, read-only. See this file's own header comment for the mechanics
 * reproduced from `WorldCanvas.tsx`, and `packages/ui/DESIGN.md` for the
 * `world-canvas__*` classes reused verbatim below.
 */
export function GbcWorldCanvas({ time, jumpToMap, jumpToken, onSelectMap, onOpenMap, onJumpToMap }: GbcWorldCanvasProps) {
  const { data: world, error } = useGbcWorld();
  const { data: coverageData, error: coverageError } = useGbcCoverage();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());
  const encounterCacheRef = useRef<Map<string, EncounterCacheEntry>>(new Map());
  const conflictBadgesRef = useRef<Array<{ x: number; y: number; text: string }>>([]);
  const dragRef = useRef<DragState>(null);
  // Same "did a real drag happen" guard `WorldCanvas.tsx`'s own
  // `dragMovedRef` is for -- a plain click/dblclick fires even after a
  // same-element drag (browsers do not suppress it), so this is what
  // actually tells the two apart.
  const dragMovedRef = useRef(false);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<GbcWorldView>({ zoom: 1, pan: { x: 0, y: 0 }, fitted: false });
  const [placementOverrides, setPlacementOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const { zoom, pan, fitted } = view;
  const placements = useMemo<Record<string, GbcWorldPlacement>>(
    () => !world ? {} : Object.fromEntries(Object.entries(world.placements).map(([name, placement]) => {
      const override = placementOverrides[name];
      return [name, override ? { ...placement, ...override, manual: true } : placement];
    })),
    [world, placementOverrides],
  );
  const [compositeVersion, setCompositeVersion] = useState(0);
  // Bumped whenever encounterCacheRef's own contents change (a per-map
  // fetch landing) -- the same "a ref never usefully appears in a
  // dependency array, so a version counter stands in for it" shape
  // WorldCanvas.tsx's own encounterVersion/encounterCacheRef pair uses.
  const [encounterVersion, setEncounterVersion] = useState(0);
  // Fix round (spec review F4): how many visible maps' /api/encounters fetch
  // has failed (a non-OK status, or a shape that fails isGbcEncountersPayload
  // -- e.g. a GBA-shaped { mapName, mapId, methods } response reaching a GBC
  // canvas) -- surfaced as a visible note rather than looking indistinguishable
  // from "this map genuinely has no encounters" (a real, normal state).
  const [encounterFailedCount, setEncounterFailedCount] = useState(0);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  // Coverage lenses + species spotlight (Plan 6b Task 6) -- mirrors
  // WorldCanvas.tsx's own `lens`/`spotlightHits` state exactly, including
  // the three-state `spotlightHits` contract (`null` = no active search,
  // `[]` = searched and found nowhere, otherwise the hit array) documented
  // on SpeciesSpotlight's own `onHits` prop.
  const [lens, setLens] = useState<LensId | null>(null);
  const [spotlightHits, setSpotlightHits] = useState<GbcSpeciesHit[] | null>(null);
  // { map, token } rather than a bare map name (fix round, F7) -- see the
  // fade effect's own comment below for why the token has to be part of
  // this state's own identity.
  const [jumpHighlight, setJumpHighlight] = useState<{ map: string; token: number } | null>(null);

  // Measure the viewport -- WorldCanvas.tsx's own "Measure the viewport"
  // effect (same pattern, verbatim).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Initial fit: once, as soon as the world AND a real viewport are both
  // available -- the multi-map-components-only bounds (Task 5 spec), not
  // GBA's own "no auto-fit at all" posture. `fitted: true` is set in this
  // SAME `setView` call (fix round, F5): before this fix, `visible`/the
  // load effect below could run once against the mount default (zoom 1,
  // pan {0,0}) in the very commit `world` first resolved -- at zoom 1 a
  // real viewport covers nearly the whole 255x746-block world, so that one
  // stale render fetched and decoded ~308 of 391 map renders (measured
  // live), not the ~80 the fit actually shows. Gating `visible` on `fitted`
  // means nothing is culled or loaded from ANY pre-fit view, not just the
  // default one.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (!world || initialFitDoneRef.current) return;
    if (viewport.w <= 0 || viewport.h <= 0) return;
    initialFitDoneRef.current = true;
    const bounds = initialFitBounds(world) ?? fitAllBounds(placements);
    if (bounds) setView({ ...computeFit(bounds, viewport, GBC_ZOOM_BOUNDS), fitted: true });
  }, [world, viewport, placements]);

  const fitAll = useCallback(() => {
    if (!world) return;
    const bounds = fitAllBounds(placements);
    if (bounds) setView({ ...computeFit(bounds, viewport, GBC_ZOOM_BOUNDS), fitted: true });
  }, [world, viewport, placements]);

  // Culling: only placements whose block-rect intersects the current
  // viewport are "visible" -- WorldCanvas.tsx's own `visible` memo, minus
  // every GBA-only concern (mapType visibility, mapFilter, sizeByMap) that
  // has no GBC equivalent. Gated on `fitted` (fix round, F5): see the
  // initial-fit effect's own comment above.
  const visible = useMemo(() => {
    if (!world || !fitted) return [] as GbcWorldPlacement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: GbcWorldPlacement[] = [];
    for (const p of Object.values(placements)) {
      if (p.width <= 0 || p.height <= 0) continue;
      if (!p.manual && (p.mapType === "INDOOR" || p.mapType === "GATE")) continue;
      if (intersects(p.x, p.y, p.width, p.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, placements, pan, zoom, viewport, fitted]);

  // GBC-specific: a time switch drops the WHOLE image cache (every
  // reference), so a stale day/nite image is never drawn under the new
  // time and never held alongside it -- decoded renders are ~153MB PER
  // TIME OF DAY at native size (Task 5 spec's own measured fact), so this
  // canvas holds at most one time's worth at once.
  useEffect(() => {
    imageCacheRef.current.clear();
    setCompositeVersion((v) => v + 1);
  }, [time]);

  // Load (and cache) the source image for every visible placement that
  // doesn't have one yet, keyed by map name only -- WorldCanvas.tsx's own
  // "Load (and cache) the source image for every visible placement"
  // comment/effect. Depends on `time` too (not just `visible`) so a
  // time switch re-populates the now-empty cache above with the new time's
  // URLs for whatever is still visible.
  useEffect(() => {
    for (const p of visible) {
      if (imageCacheRef.current.has(p.map)) continue;
      const entry: ImageCacheEntry = { loaded: false };
      imageCacheRef.current.set(p.map, entry);
      const img = new Image();
      img.onload = () => {
        entry.loaded = true;
        entry.img = img;
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(p.width * BLOCK_PX * LOD_SCALE));
        small.height = Math.max(1, Math.round(p.height * BLOCK_PX * LOD_SCALE));
        const sctx = small.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(img, 0, 0, small.width, small.height);
        }
        entry.small = small;
        setCompositeVersion((v) => v + 1);
      };
      img.src = `/api/render/${encodeURIComponent(p.map)}.png?time=${time}`;
    }
  }, [visible, time]);

  // Fetches every visible placement's encounter sources at most ONCE PER
  // MAP EVER (Task 5 quality review, binding note: "the encounter cache is
  // time-independent"). Deliberately NOT keyed on `time` and deliberately
  // NOT cleared by the image cache's own time-change effect above -- unlike
  // a rendered PNG (one per time of day), `gbcEncounterSources` returns
  // every method/time/rod/list variant a map has in one response; a time
  // switch only changes which species `EncounterBorder` dims / which rows
  // `methodTint` reads, at render, not what was fetched. Mirrors
  // WorldCanvas.tsx's own encounter-fetch effect's cache-by-ref shape
  // (placeholder written synchronously, `loaded` set on arrival, a version
  // bump so its own reader memos re-run).
  // Fix round (spec review F4): uses the shared `fetchGuarded` (the same
  // non-hook fetch->ok->guard->error core `useGuardedFetch` itself now
  // wraps) instead of a hand-rolled fetch/ok/guard/catch block -- the
  // spec's own "every fetch goes through the shared guarded-fetch helper"
  // convention, which this effect (a per-item cache-by-ref loop, not a
  // single-URL hook call) had been the one place still bypassing.
  useEffect(() => {
    for (const p of visible) {
      if (encounterCacheRef.current.has(p.map)) continue;
      const entry: EncounterCacheEntry = { loaded: false };
      encounterCacheRef.current.set(p.map, entry);
      const url = `/api/encounters/${encodeURIComponent(p.map)}`;
      fetchGuarded(url, isGbcEncountersPayload, url)
        .then((d) => {
          entry.loaded = true;
          entry.sources = d.sources;
          entry.summaries = summariseGbc(d.sources);
          setEncounterVersion((v) => v + 1);
        })
        .catch(() => {
          // Best-effort, mirroring the image cache's own posture (and
          // WorldCanvas.tsx's own identical encounter-fetch catch): a failed
          // fetch just leaves this one map's border/tint entry empty, not a
          // banner over an otherwise-working canvas -- but, unlike before
          // (F4), it's now COUNTED, so "empty" is disclosed rather than
          // silently indistinguishable from "no encounters here" (a normal
          // state). Still marked loaded so this effect never retries a
          // failed map in a loop.
          entry.loaded = true;
          setEncounterFailedCount((c) => c + 1);
          setEncounterVersion((v) => v + 1);
        });
    }
  }, [visible]);

  // One screen-rect-per-visible-placement memo (fix round, spec review F10:
  // the binding Task 5 note's own "build ONE memo of screen-space rects...
  // feed the border and lens overlays from it", which borderEntries/
  // lensOverlayEntries/spotlightOverlayEntries below each recomputing the
  // same dx/dy/dw/dh formula independently didn't actually satisfy) --
  // consumed by all three.
  const rectByMap = useMemo(() => {
    const m = new Map<string, Rect>();
    for (const p of visible) m.set(p.map, { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: p.width * zoom, height: p.height * zoom });
    return m;
  }, [visible, pan, zoom]);

  // Which side of each map the encounter border sits on (B2's pickBorderSide, in
  // world blocks). Over EVERY placement, not just the viewport-culled `visible`: a
  // map just off-screen still blocks a side, and every GBC placement is drawn.
  // Depends on `world` only, never pan/zoom (it would re-run every drag
  // frame). Every rect is passed as the neighbour list, including the map's
  // own: that blocks nothing, since the bands lie strictly outside it
  // (pickBorderSide's own doc comment).
  // ponytail: O(n^2) over ~391 maps, once per world load; a spatial index if
  // n grows.
  const sideByMap = useMemo(() => {
    const m = new Map<string, BorderSide>();
    if (!world) return m;
    const placed = Object.values(placements).filter((p) => p.width > 0 && p.height > 0);
    const rects: Rect[] = placed.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
    placed.forEach((p, i) => m.set(p.map, pickBorderSide(rects[i]!, rects, BORDER_BAND.gbc)));
    return m;
  }, [world, placements]);

  // EncounterBorder's own prop shape -- a memo separate from the
  // imperative draw effect (Task 5 quality review, binding note), mirroring
  // WorldCanvas.tsx's own borderEntries/lensOverlayEntries/
  // spotlightOverlayEntries split. Hoists the `encounterCacheRef.current.get`
  // lookup once per placement (fix round, quality review Q1 -- this used to
  // call `.get(p.map)` twice per entry).
  const borderEntries = useMemo<EncounterBorderEntry[]>(() => {
    return visible.map((p) => {
      const cache = encounterCacheRef.current.get(p.map);
      return {
        map: p.map,
        rect: rectByMap.get(p.map)!,
        side: sideByMap.get(p.map) ?? "left",
        summaries: cache?.loaded ? (cache.summaries ?? []) : undefined,
      };
    });
    // encounterVersion, not encounterCacheRef itself (a ref never usefully
    // appears in a dependency array) -- mirrors WorldCanvas.tsx's own
    // identical comment on its own borderEntries memo.
  }, [visible, rectByMap, sideByMap, encounterVersion]);

  // mapName -> its already-fetched sources (or undefined if not yet loaded)
  // -- the one place both the method lens and (were it needed) any future
  // per-map encounter reader would look this up, mirroring
  // WorldCanvas.tsx's own methodTintFor closure over encounterCacheRef.
  const methodTintFor = useCallback((map: string): string | null => {
    return methodTint(encounterCacheRef.current.get(map)?.sources);
  }, []);

  // mapName -> a blue(low)/red(high) colour string, reusing the exact ramp
  // WorldCanvas.tsx's own level-curve lens uses (levelColorMap, exported
  // additively from that file -- see its own doc comment). Deliberately its
  // OWN memo, keyed only on coverageData -- fetched once and never again
  // (GBC is read-only), so this runs once, not on every pan/zoom frame the
  // way lensOverlayEntries below necessarily does.
  const levelColorByMap = useMemo(() => {
    const entries = (coverageData?.levelByMap ?? []).filter((e) => !!e.mapName);
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const low = style?.getPropertyValue("--overlay-elevation-low").trim() || "#3b82f6";
    const high = style?.getPropertyValue("--danger").trim() || "#ef4444";
    return levelColorMap(entries, low, high);
  }, [coverageData]);

  // Map NAMES with no encounter table at all -- coverage()'s own
  // mapsWithoutEncounters is already keyed by name.
  const emptyMapNames = useMemo(() => new Set(coverageData?.mapsWithoutEncounters ?? []), [coverageData]);

  // Per-map lens tint overlay -- mirrors WorldCanvas.tsx's own
  // lensOverlayEntries memo exactly (level-curve/empty-maps/method; GBC has
  // no "unused-species" per-map visual either, for the identical reason
  // that lens documents on itself: it's a fact about species, not a place).
  const lensOverlayEntries = useMemo(() => {
    if (!lens) return [] as Array<{ map: string; rect: Rect; color: string }>;
    const out: Array<{ map: string; rect: Rect; color: string }> = [];
    for (const p of visible) {
      let color: string | null = null;
      if (lens === "level-curve") color = levelColorByMap.get(p.map) ?? null;
      else if (lens === "empty-maps") color = emptyMapNames.has(p.map) ? "var(--warn)" : null;
      else if (lens === "method") color = methodTintFor(p.map);
      if (!color) continue;
      out.push({ map: p.map, rect: rectByMap.get(p.map)!, color });
    }
    return out;
    // encounterVersion, not encounterCacheRef itself -- the method lens
    // reads that ref via methodTintFor; mirrors WorldCanvas.tsx's own
    // identical comment on its own lensOverlayEntries memo.
  }, [lens, visible, rectByMap, levelColorByMap, emptyMapNames, methodTintFor, encounterVersion]);

  // mapName -> its best (highest-percent) hit -- gbcWhereSpecies already
  // sorts by percent descending, mirrors WorldCanvas.tsx's own
  // spotlightByMap exactly.
  const spotlightByMap = useMemo(() => {
    const out = new Map<string, GbcSpeciesHit>();
    if (!spotlightHits) return out;
    for (const h of spotlightHits) {
      const existing = out.get(h.mapName);
      if (!existing || h.percent > existing.percent) out.set(h.mapName, h);
    }
    return out;
  }, [spotlightHits]);

  const spotlightOverlayEntries = useMemo(() => {
    if (!spotlightHits) return [] as Array<{ map: string; rect: Rect; hit: GbcSpeciesHit | null }>;
    return visible.map((p) => ({ map: p.map, rect: rectByMap.get(p.map)!, hit: spotlightByMap.get(p.map) ?? null }));
  }, [spotlightHits, visible, rectByMap, spotlightByMap]);

  // The actual draw. `viewport` MUST stay in this dependency list (see the
  // header comment's Task 21 citation).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const useLod = shouldUseLod(zoom);
    for (const p of visible) {
      const cache = imageCacheRef.current.get(p.map);
      if (!cache?.loaded) continue;
      const dx = p.x * zoom + pan.x, dy = p.y * zoom + pan.y;
      const dw = p.width * zoom, dh = p.height * zoom;
      if (useLod && cache.small) ctx.drawImage(cache.small, dx, dy, dw, dh);
      else if (cache.img) ctx.drawImage(cache.img, dx, dy, dw, dh);
    }

    if (!world) return;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const conflictColor = style?.getPropertyValue("--danger").trim() || "#ef4444";

    // Conflicts: a diamond at Conflict.map's top-right corner, plus a
    // hit-rect for the hover tooltip below -- WorldCanvas.tsx's own
    // "Conflicts: a diamond at the offending map's top-right corner"
    // comment/loop, never hidden behind a toggle.
    const badges: Array<{ x: number; y: number; text: string }> = [];
    for (const conflict of world.conflicts) {
      const p = placements[conflict.map];
      if (!p || p.width <= 0 || p.height <= 0) continue;
      const cx = p.x * zoom + pan.x + p.width * zoom - BADGE_SIZE;
      const cy = p.y * zoom + pan.y + BADGE_SIZE;
      drawDiamond(ctx, cx, cy, BADGE_SIZE, conflictColor);
      badges.push({ x: cx, y: cy, text: conflictTooltipText(conflict) });
    }
    conflictBadgesRef.current = badges;
  }, [compositeVersion, pan, zoom, viewport, visible, world, placements]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);

  // Native, { passive: false } -- see the header comment.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      setView((v) => zoomWorldAboutPivot(v, factor, x, y));
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const hitTest = useCallback(
    (wx: number, wy: number): GbcWorldPlacement | null => {
      for (let i = visible.length - 1; i >= 0; i--) {
        const p = visible[i]!;
        if (wx >= p.x && wx < p.x + p.width && wy >= p.y && wy < p.y + p.height) return p;
      }
      return null;
    },
    [visible],
  );

  const [saveError, setSaveError] = useState<string | null>(null);
  const postPlacement = (map: string, x: number, y: number) => {
    fetch("/api/world/placement", { method: "POST", body: JSON.stringify({ map, x, y }) })
      .then((r) => {
        if (!r.ok) throw new Error(`POST /api/world/placement -> ${r.status}`);
      })
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragMovedRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = e.shiftKey ? hitTest(point.x, point.y) : null;
    dragRef.current = hit
      ? { kind: "map", map: hit.map, grabX: point.x - hit.x, grabY: point.y - hit.y, startX: hit.x, startY: hit.y, x: hit.x, y: hit.y }
      : { kind: "pan", x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.kind === "pan") {
      dragMovedRef.current = true;
      setView((v) => ({ ...v, pan: { x: drag.panX + (e.clientX - drag.x), y: drag.panY + (e.clientY - drag.y) } }));
      return;
    }
    if (drag?.kind === "map") {
      dragMovedRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const x = Math.round(point.x - drag.grabX), y = Math.round(point.y - drag.grabY);
      drag.x = x;
      drag.y = y;
      setPlacementOverrides((overrides) => ({ ...overrides, [drag.map]: { x, y } }));
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const badge = conflictBadgesRef.current.find((b) => Math.hypot(b.x - sx, b.y - sy) <= BADGE_SIZE);
    setTooltip(badge ? { x: sx, y: sy, text: badge.text } : null);

    const w = screenToWorld(sx, sy);
    const hit = hitTest(w.x, w.y);
    if (!hit || !world) {
      setHover(null);
      return;
    }
    const component = hit.component >= 0 && hit.component < world.components.length ? world.components[hit.component]! : null;
    setHover({ map: hit.map, component, width: hit.width, height: hit.height });
  };

  const commitMapDrag = () => {
    const drag = dragRef.current;
    if (drag?.kind === "map" && (drag.x !== drag.startX || drag.y !== drag.startY)) postPlacement(drag.map, drag.x, drag.y);
  };

  const onMouseUp = () => {
    commitMapDrag();
    dragRef.current = null;
  };

  const onMouseLeave = () => {
    commitMapDrag();
    dragRef.current = null;
    setHover(null);
    setTooltip(null);
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    setSelectedMap(hit ? hit.map : null);
    if (hit) onSelectMap?.(hit.map);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    if (hit) onOpenMap?.(hit.map);
  };

  // Keyboard path (fix round, quality review Minor #3): the canvas's own
  // click-to-select/double-click-to-open interactions had no keyboard
  // equivalent -- WorldCanvas.tsx's own canvas is in the same position for
  // ITS click-to-select path (its own tabIndex/onKeyDown pair only
  // implements Escape-clears-multi-select, which has no GBC analogue), but
  // this is the second canvas in the app to ship that gap, so a minimal
  // path is added here: Enter opens whatever is currently selected (the
  // same target a double-click would open), and +/- zoom about the
  // viewport's own centre through the SAME `zoomWorldAboutPivot` a wheel
  // notch uses (the identical single-state-updater reasoning applies:
  // one `setView` per key, never a nested one).
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "Enter") {
      if (selectedMap) onOpenMap?.(selectedMap);
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setView((v) => zoomWorldAboutPivot(v, WHEEL_FACTOR, viewport.w / 2, viewport.h / 2));
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setView((v) => zoomWorldAboutPivot(v, 1 / WHEEL_FACTOR, viewport.w / 2, viewport.h / 2));
    }
  };

  // Map-list jump: centre jumpToMap at ~60% of the viewport, then flash an
  // outline -- WorldCanvas.tsx's own jump effect and its "retry once world
  // itself changes" reasoning (a tree click can arrive before /api/world has
  // resolved, e.g. switching to World mode right after selecting a map in
  // Map mode), guarded so an already-handled token is never re-applied.
  const appliedJumpTokenRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJumpTokenRef.current) return;
    if (!jumpToMap || !world) return; // retry once `world` itself changes
    appliedJumpTokenRef.current = jumpToken;
    const p = placements[jumpToMap];
    if (!p || p.width <= 0 || p.height <= 0) return;
    setView({ ...jumpFit({ x: p.x, y: p.y, width: p.width, height: p.height }, viewport), fitted: true });
    setJumpHighlight({ map: jumpToMap, token: jumpToken });
  }, [jumpToken, jumpToMap, world, viewport, placements]);

  // The fade-out, kept in its own effect scoped to `jumpHighlight` alone --
  // WorldCanvas.tsx's own separately-scoped fade effect gives the same
  // reasoning: coupling this to the jump-triggering effect above (which
  // also depends on `viewport`, which can change independently, e.g. a
  // window resize) would kill and never reschedule the pending timer.
  //
  // Fix round (F7): unlike WorldCanvas.tsx's own accepted quirk (documented
  // on its own jump-highlight `key` comment) where a same-map re-click sets
  // `jumpHighlight` to an identical string, React bails the state update,
  // and this effect's dependency never changes -- so the FIRST click's timer
  // just keeps counting down and can clear the outline well short of a full
  // fresh window -- `jumpHighlight` here is `{ map, token }`, a fresh object
  // every jump (the token always changes), so this effect always re-runs
  // and the fade genuinely restarts on every jump, including a re-click of
  // the same map. A deliberate, minimal divergence from GBA for this one
  // rough edge, not a copy of it.
  useEffect(() => {
    if (!jumpHighlight) return;
    const timer = setTimeout(() => setJumpHighlight(null), JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [jumpHighlight]);

  const zoomPercent = Math.round((zoom / BLOCK_PX) * 100);
  const selectedRect = selectedMap ? placements[selectedMap] ?? null : null;
  const jumpRect = jumpHighlight ? placements[jumpHighlight.map] ?? null : null;

  return (
    <section className="world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        <div className="world-canvas__toolbar-group">
          <button type="button" className="map-canvas__btn" onClick={fitAll}>
            Fit all
          </button>
        </div>
        {/* Fix round (spec review F4): a visible note, not a silent gap,
            for however many visible maps' own /api/encounters fetch failed
            (a 500, or a shape that fails isGbcEncountersPayload) -- reuses
            the same world-canvas__toolbar-error class/role="alert" the
            coverage-error slot below already uses. */}
        {encounterFailedCount > 0 && (
          <div className="world-canvas__toolbar-group">
            <span className="world-canvas__toolbar-error" role="alert">
              Encounter data unavailable for {encounterFailedCount} map{encounterFailedCount === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {saveError && (
          <div className="world-canvas__toolbar-group">
            <span className="world-canvas__toolbar-error" role="alert">Could not save placement: {saveError}</span>
          </div>
        )}
        {/* Species spotlight + coverage lenses (Plan 6b Task 6) -- reuses
            WorldCanvas.tsx's own themed grow group so this control cluster
            gets the same extra middle space there, not a bespoke width. */}
        <div className="world-canvas__toolbar-group world-canvas__toolbar-group--grow">
          <SpeciesSpotlight<GbcSpeciesHit> onHits={setSpotlightHits} />
          {coverageError ? (
            <span className="world-canvas__toolbar-error" role="alert">
              Coverage lenses unavailable: {coverageError}
            </span>
          ) : (
            <LensPanel active={lens} onChange={setLens} />
          )}
        </div>
      </div>

      {!coverageError && (
        <LensLegend
          active={lens}
          summary={
            coverageData
              ? { emptyMapNames: coverageData.mapsWithoutEncounters, unusedSpeciesNames: coverageData.unusedSpecies }
              : null
          }
          onJumpToMap={onJumpToMap}
          methodKey={GBC_METHOD_LENS_KEY}
          legendCopy={GBC_LEGEND_COPY}
        />
      )}

      <div className="world-canvas__legend">
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--conflict" /> Conflict
        </span>
      </div>

      <div className="world-canvas__body">
        <div className="world-canvas__viewport" ref={containerRef}>
          {error ? (
            <p className="app__canvas-placeholder">Could not load the world: {error}</p>
          ) : !world ? (
            <p className="app__canvas-placeholder">Loading world…</p>
          ) : null}
          <canvas
            ref={canvasRef}
            className="world-canvas__stage"
            width={viewport.w}
            height={viewport.h}
            tabIndex={0}
            aria-label="World map. Plus or minus zooms; Enter opens the selected map."
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const map = e.dataTransfer.getData("text/plain");
              const placement = placements[map];
              if (!placement) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
              const x = Math.round(point.x - placement.width / 2), y = Math.round(point.y - placement.height / 2);
              setPlacementOverrides((overrides) => ({ ...overrides, [map]: { x, y } }));
              postPlacement(map, x, y);
            }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
          />
          <EncounterBorder entries={borderEntries} zoom={zoom} lodZoom={GBC_LOD_ZOOM_THRESHOLD} band={BORDER_BAND.gbc} time={time} />
          {lens && lensOverlayEntries.length > 0 && (
            <div className="world-canvas__lens" aria-hidden="true">
              {lensOverlayEntries.map((e) => (
                <div
                  key={e.map}
                  className="world-canvas__lens-tint"
                  style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height, background: e.color }}
                />
              ))}
            </div>
          )}
          {spotlightHits !== null && (
            <div className="world-canvas__spotlight" aria-hidden="true">
              {spotlightOverlayEntries.map((e) =>
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
          )}
          {selectedRect && (
            <div className="world-canvas__selection" aria-hidden="true">
              <div
                className="world-canvas__selection-outline"
                style={{ left: selectedRect.x * zoom + pan.x, top: selectedRect.y * zoom + pan.y, width: selectedRect.width * zoom, height: selectedRect.height * zoom }}
              />
            </div>
          )}
          {jumpRect && (
            <div className="world-canvas__selection" aria-hidden="true">
              {/* Keyed on jumpToken (WorldCanvas.tsx's own "keyed on jumpToken
                  (not jumpToMap)" comment makes the same review
                  fix): without it, re-jumping to the same map name reuses
                  the same DOM node, whose `forwards`-filling fade animation
                  has already finished, so it would not visibly restart. */}
              <div
                key={jumpToken}
                className="world-canvas__selection-outline world-canvas__jump-highlight"
                style={{ left: jumpRect.x * zoom + pan.x, top: jumpRect.y * zoom + pan.y, width: jumpRect.width * zoom, height: jumpRect.height * zoom }}
              />
            </div>
          )}
          {tooltip && (
            <div className="world-canvas__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
              {tooltip.text}
            </div>
          )}
        </div>
      </div>

      <div className="world-canvas__status">
        <span className="world-canvas__status-item">
          {world ? world.components.length : 0} components · {Object.keys(placements).length} maps · zoom {zoomPercent}%
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component ? ` · component #${hover.component.index} (${hover.component.maps.length} maps) · ${hover.width}×${hover.height} blocks` : ""}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">Hover the world…</span>
        )}
      </div>
    </section>
  );
}
