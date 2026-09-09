import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Component as WorldComponentInfo, Conflict, VerticalLink } from "@pokemap/core/src/world/connections.js";
import type { SpeciesHit } from "@pokemap/core/src/analyse/coverage.js";
import { EncounterGutter, type EncounterGutterMapEntry, type EncounterGutterRow } from "./EncounterGutter.js";
import { SpeciesSpotlight } from "./SpeciesSpotlight.js";
import { LensPanel, type LensId } from "./LensPanel.js";
import { useCoverage } from "../hooks/useCoverage.js";
import { isDrawnByDefault } from "../world/visibility.js";

/** The pixel size a placement's PNG renders at natively (`renderLayout`,
 *  border 0): 16px per tile, same constant the CLI's `render-world --scale
 *  16` calls "full size". */
const TILE_PX = 16;

/** Zoom is screen pixels per tile -- 16 is native resolution, matching the
 *  CLI's own `--scale` semantics (`16 = full size, 4 = overview`), so the
 *  same mental model applies whether the raster comes from the UI or the
 *  CLI. */
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 16;
const WHEEL_FACTOR = 1.2;

/** Below this many screen px per tile, redraw from the cached downscaled
 *  buffer rather than the full-resolution source image -- see the LOD
 *  requirement in Task 25 Step 5. */
const LOD_ZOOM_THRESHOLD = 4;
/** Fraction of native resolution the cached LOD buffer is rendered at. */
const LOD_SCALE = 0.25;

const BADGE_SIZE = 10;

/** Placement.map plus the two Feature A fields Task 1 added to the wire
 *  response (packages/server/src/index.ts's `/api/world` route). A
 *  superset of Placement, so every existing helper that takes a `Placement`
 *  (sizeOfPlacement, componentOfPlacement, intersects/contains callers)
 *  keeps working unchanged via plain structural typing.
 *
 *  Both fields are OPTIONAL here, not required as the server's own
 *  same-named WirePlacement has them (deliberate divergence, not a copy
 *  error): a placement fabricated CLIENT-SIDE for a fresh sidebar/rail drop
 *  (onDropOnCanvas below) has neither field set -- it is the optimistic
 *  local echo of a drag, built before the server round trip that would
 *  normally attach them, and requiring them here would make that literal
 *  fail to type-check. Every reader treats a missing field as "not hidden"
 *  via `?? ""` / `?? false` (see the `visible` memo and the jump effect
 *  below), which is also exactly correct for this specific fabricated case:
 *  a map the user just deliberately dropped must draw immediately, not wait
 *  on a round trip. `r.json() as Promise<WorldPayload>` in the /api/world
 *  effect is a type assertion, not a runtime check, so a real server
 *  response (or a test fixture built before this task) that omits these
 *  fields is equally handled by the same fallback, not just this one
 *  fabricated-placement case. */
interface WirePlacement extends Placement {
  mapType?: string;
  manual?: boolean;
}

interface WorldPayload {
  placements: Record<string, WirePlacement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecar: { dungeonAutoLayout: boolean };
}

interface WorldState {
  placements: Map<string, WirePlacement>;
  components: WorldComponentInfo[];
  conflicts: Conflict[];
  verticalLinks: VerticalLink[];
  sidecarDungeonAutoLayout: boolean;
}

interface Viewport {
  w: number;
  h: number;
}

interface Pan {
  x: number;
  y: number;
}

interface ImageCacheEntry {
  loaded: boolean;
  img?: HTMLImageElement;
  small?: HTMLCanvasElement;
}

/** Mirrors ImageCacheEntry's own shape exactly, for the same reason: a
 *  placeholder is written synchronously before the fetch starts, so a second
 *  effect run for the same map (another placement scrolling into view, or a
 *  pan that doesn't drop this one) sees `.has(map)` and never double-fetches.
 *  `methods` stays unset on a failed fetch -- EncounterGutter already treats
 *  an unset map as "nothing to show", not an error banner. */
interface EncounterCacheEntry {
  loaded: boolean;
  methods?: EncounterGutterRow[];
}

type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: Pan }
  // startTileX/Y is the placement's OWN position at the moment the drag
  // began, kept so commitMapDrag can tell "did this actually move to a
  // different tile" from "the user grabbed it and let go again" -- see
  // its own review-fix comment.
  | { kind: "map"; map: string; grabDX: number; grabDY: number; startTileX: number; startTileY: number }
  | { kind: "group"; anchorMap: string; grabDX: number; grabDY: number; starts: Map<string, { x: number; y: number }> }
  | { kind: "marquee"; startX: number; startY: number }
  | null;

interface HoverInfo {
  map: string;
  component: WorldComponentInfo | null;
}

interface TooltipInfo {
  x: number;
  y: number;
  text: string;
}

/**
 * A placement from applySidecar's fallback branch (a manual position for a
 * map that isn't in the current base/auto set -- most commonly, dungeons is
 * off and the user just dragged a previously-unplaced map onto the canvas
 * from the side rail) carries `component: -1` and `width:0, height:0`
 * (sidecar.ts has no Project to size it correctly -- see
 * packages/core/test/world/sidecar.test.ts's "fabricates a placeholder
 * placement" test for the documented shape). `-1` does not index into
 * `components` (0-indexed): `components[-1]` is `undefined` in JS, not a
 * throw, but reading `.bounds`/`.maps` off it would be. Every caller that
 * needs a placement's real size or component goes through these two
 * helpers instead of indexing `components[placement.component]` directly.
 */
function sizeOfPlacement(p: Placement, sizeByMap: Map<string, { width: number; height: number }>): { width: number; height: number } {
  if (p.component !== -1) return p;
  return sizeByMap.get(p.map) ?? p;
}

function componentOfPlacement(p: Placement, components: WorldComponentInfo[]): WorldComponentInfo | null {
  return p.component >= 0 && p.component < components.length ? components[p.component]! : null;
}

/** Whether a placement should draw by default (Feature A, spec §3.1) --
 *  thin wrapper around visibility.ts's isDrawnByDefault that centralises
 *  the `?? ""` / `?? false` fallback needed at this component's two read
 *  sites (the `visible` memo and the jump effect, below), rather than
 *  repeating it at each. `p.mapType`/`p.manual` are always present on a
 *  server-fetched placement (Task 1); a locally-fabricated component:-1
 *  placement from a fresh sidebar/rail drop (onDropOnCanvas below) has
 *  neither field, but that object represents a map the user JUST
 *  deliberately placed -- `isDrawnByDefault("", false)` reads as "not
 *  hidden" (HIDDEN_MAP_TYPES never contains ""), so it draws immediately
 *  without needing either call site's cooperation. */
function drawnByDefault(p: WirePlacement): boolean {
  return isDrawnByDefault(p.mapType ?? "", p.manual ?? false);
}

/** AABB test in world-tile space. Mirrors the CLI's render-world culling
 *  exactly (`p.x + p.width <= bx || p.x >= bx + bw || ...`) so the two stay
 *  consistent. */
function intersects(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return !(px + pw <= x0 || px >= x1 || py + ph <= y0 || py >= y1);
}

/** Full-containment AABB test, in world-tile space -- the "dragged right"
 *  half of the marquee's direction-sensitive selection (Step 9 below).
 *  `intersects` (already in this file) is the "dragged left" / crossing
 *  half. */
function contains(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return px >= x0 && py >= y0 && px + pw <= x1 && py + ph <= y1;
}

interface FitResult {
  zoom: number;
  pan: Pan;
}

/** Pure so a test can predict the result by hand, the same way MapCanvas's
 *  tests reason about `fit()`. Centres `bounds` in `viewport` at the
 *  largest zoom (clamped) that shows all of it. */
export function computeFit(bounds: { x: number; y: number; width: number; height: number }, viewport: Viewport): FitResult {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(viewport.w / bounds.width, viewport.h / bounds.height)));
  return {
    zoom,
    pan: {
      x: -bounds.x * zoom + (viewport.w - bounds.width * zoom) / 2,
      y: -bounds.y * zoom + (viewport.h - bounds.height * zoom) / 2,
    },
  };
}

function worldBoundsOf(placements: Map<string, Placement>, sizeByMap: Map<string, { width: number; height: number }>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placements.values()) {
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) continue; // a true orphan (removed map) -- unknowable, excluded
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + size.width); y1 = Math.max(y1, p.y + size.height);
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Props for {@link WorldCanvas}: the map-list jump target (Task 2). */
export interface WorldCanvasProps {
  /** A map name to pan/zoom to, or null/undefined for none. Mirrors
   *  App.tsx's shared `selected` state -- set by clicking a name in the
   *  sidebar map list while in World mode. */
  jumpToMap?: string | null;
  /** Bumped by the caller on every click, even a re-click of the same
   *  name -- jumpToMap alone can't distinguish "jump here again" from "no
   *  change", since React state setters no-op on an identical primitive
   *  value. */
  jumpToken?: number;
}

/**
 * The stitched world: 1,209 maps culled to the viewport, panned and zoomed,
 * with drag-to-place, a dungeon-layout toggle backed by a side rail for
 * unplaced maps, and conflict/vertical-link badges. See
 * packages/ui/DESIGN.md for the palette/type/spacing tokens this consumes,
 * and this file's own comments for the LOD and culling mechanics.
 */
export function WorldCanvas({ jumpToMap, jumpToken }: WorldCanvasProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());
  const encounterCacheRef = useRef<Map<string, EncounterCacheEntry>>(new Map());
  const dragRef = useRef<DragState>(null);
  const conflictBadgesRef = useRef<Array<{ x: number; y: number; text: string }>>([]);
  // Review fix: whether real pointer movement happened during the
  // mousedown-to-mouseup cycle that is about to produce a `click`. The
  // browser does NOT suppress `click` after a same-element drag -- see
  // onCanvasClick's own comment below -- so this ref is what actually
  // distinguishes "the user dragged, then the button happened to come up
  // over the same element" from a genuine click. Reset at the top of every
  // mousedown, set whenever onMouseMove observes a live drag (any kind).
  const dragMovedRef = useRef(false);

  const [world, setWorld] = useState<WorldState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Review fix: postPlacement's and toggleDungeons' own failures used to
  // either be silently discarded or written into loadError -- the same
  // state used for "the whole world failed to load", which only resets at
  // the top of a SUCCESSFUL /api/world fetch. That let a single failed
  // save show a permanent, wrongly-labeled banner over a fully working
  // canvas. saveError is a separate, dismissible slot for "your change
  // failed to save"; loadError stays scoped to the actual load failure it
  // names.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Review fix: this used to be a purely local override that only changed
  // the query string on the NEXT fetch -- nothing ever persisted
  // sidecar.dungeonAutoLayout, so a reload silently discarded it, even
  // though Step 5 calls this "a visible switch for dungeonAutoLayout" and
  // that field exists specifically to be persisted, the same way manual
  // placements are. dungeonsOn is now derived purely from the server's own
  // sidecar value; dungeonsPending is only a same-frame optimistic echo of
  // an in-flight POST, cleared on failure (so a rejected write doesn't
  // leave the switch showing something that was never actually saved) AND
  // cleared once a SUCCESSFUL toggle's own refetch lands (so it cannot
  // permanently shadow the server's value for the rest of the page
  // session -- see the /api/world effect's success handler below).
  const [dungeonsPending, setDungeonsPending] = useState<boolean | null>(null);
  const [refetchGen, setRefetchGen] = useState(0);
  const [viewport, setViewport] = useState<Viewport>({ w: 0, h: 0 });
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [compositeVersion, setCompositeVersion] = useState(0);
  const [encounterVersion, setEncounterVersion] = useState(0);
  const [railFilter, setRailFilter] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  // Task 29: species spotlight + coverage lenses. `spotlightHits` is
  // SpeciesSpotlight's own onHits contract exactly (null = no active
  // search, [] = searched and found nowhere, otherwise the hit array) --
  // see that component's doc comment for why the three states matter.
  const [spotlightHits, setSpotlightHits] = useState<SpeciesHit[] | null>(null);
  const [lens, setLens] = useState<LensId | null>(null);

  // Feature: multi-select move. Plain click selects one map (clearing the
  // rest); Ctrl/Cmd+click toggles; a marquee (Step 5) replaces the
  // selection outright. Set of map NAMES, matching how everything else in
  // this file keys placements.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Feature A: maps hidden by default (visibility.ts's isDrawnByDefault)
  // that the user has temporarily revealed by clicking their name in the
  // sidebar map list while it has a real placement (spec §3.3). Session-
  // local and unpersisted by design -- WorldCanvas fully unmounts when
  // leaving World mode (App.tsx's conditional render), which already
  // clears this for free on "leaving World mode does not survive" per the
  // spec; no explicit reset is needed.
  const [revealedMaps, setRevealedMaps] = useState<Set<string>>(new Set());

  // Map-list jump (Task 2): a transient outline on whichever map the
  // sidebar's most recent click jumped to, faded via CSS after mount --
  // see the jump effect below.
  const [jumpHighlight, setJumpHighlight] = useState<string | null>(null);

  const dungeonsOn = dungeonsPending ?? world?.sidecarDungeonAutoLayout ?? true;

  // /api/coverage backs both the level-curve/empty-maps/unused-species
  // lenses' own numbers and (level-curve, empty-maps) their per-map
  // overlays below. Fetched once, like `world` above -- the project is
  // read-only for all of Plan 1 (I8), so this can never go stale.
  //
  // Review fix: `error` used to be discarded entirely (destructured as
  // just `{ data: coverageData }`), so a failed fetch left `coverageData`
  // null forever and the toolbar's own `?? 0` fallback rendered "0 maps
  // have no encounters" as if that were real data -- in precisely the
  // copy this whole task is about, and exactly the class of bug this
  // project already has a postmortem on not doing (Task 25's review: a
  // fetch failure must surface, not get silently misrouted or dropped).
  // `coverageError` is its own dedicated slot, mirroring `loadError`
  // (the `/api/world` fetch) and `saveError` (placement/dungeon POSTs)
  // below -- each fetch's failure gets its own named state here rather
  // than overloading one of the others, the same separation this file's
  // own review history already established for exactly this reason.
  const { data: coverageData, error: coverageError } = useCoverage();

  // Measure the viewport, mirroring MapCanvas's established pattern exactly
  // (Task 21's canvas-blanking postmortem: a redraw effect that does not
  // depend on `viewport` leaves the canvas stale after any resize).
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

  // Fetch /api/world. No ?dungeons= override here -- the toggle now
  // persists to sidecar.dungeonAutoLayout (see toggleDungeons below), so a
  // plain fetch always reflects whatever was last saved, exactly like a
  // real reload would. refetchGen exists only to give this effect a
  // dependency to re-run on after that POST succeeds; it carries no data
  // of its own. `/api/world?dungeons=` itself is unchanged, but review fix:
  // nothing in this app calls it that way any more -- the CLI's
  // --no-dungeons calls resolveWorldPlacements directly (no HTTP involved
  // at all), so the query param is kept only for the server route's own
  // API completeness and packages/server/test/world.test.ts's coverage.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch("/api/world")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/world -> ${r.status}`);
        return r.json() as Promise<WorldPayload>;
      })
      .then((d) => {
        if (cancelled) return;
        setWorld({
          placements: new Map(Object.entries(d.placements)),
          components: d.components,
          conflicts: d.conflicts,
          verticalLinks: d.verticalLinks,
          sidecarDungeonAutoLayout: d.sidecar.dungeonAutoLayout,
        });
        setCompositeVersion((v) => v + 1);
        // Review fix: the server's own truth has now landed -- stop
        // shadowing it with a stale optimistic value. Harmless when this
        // runs for a reason OTHER than a successful toggle (initial mount:
        // already null; a failed toggle already nulled it before this
        // effect could re-run at all, since only a SUCCESSFUL POST bumps
        // refetchGen).
        setDungeonsPending(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refetchGen]);

  // Persists the toggle to sidecar.dungeonAutoLayout (POST
  // /api/world/dungeons, mirroring /api/world/placement's own shape) and
  // refetches once it lands, so the placements shown actually reflect the
  // new saved state -- not just the switch's own visual position.
  // dungeonsPending gives instant feedback on the switch itself without
  // waiting on the round trip; it is cleared on failure so a rejected
  // write does not leave the switch lying about what got saved (and, on
  // success, by the /api/world effect above once its own refetch lands).
  const toggleDungeons = () => {
    const next = !dungeonsOn;
    setDungeonsPending(next);
    fetch("/api/world/dungeons", { method: "POST", body: JSON.stringify({ enabled: next }) })
      .then((r) => {
        if (!r.ok) throw new Error(`POST /api/world/dungeons -> ${r.status}`);
        setRefetchGen((g) => g + 1);
      })
      .catch((e: unknown) => {
        setDungeonsPending(null);
        // Review fix: this used to write into loadError -- the same state
        // "the whole world failed to load" uses, which only resets at the
        // top of a SUCCESSFUL /api/world fetch. A failed toggle isn't that;
        // the canvas is still fully working, so this is saveError's job.
        setSaveError(e instanceof Error ? e.message : String(e));
      });
  };

  // Every map's true tile size, independent of which placements are
  // currently shown -- world.components lists every map in the project
  // always, regardless of the dungeon toggle or manual overrides (a
  // singleton component's bounds ARE that one map's own rect). Used to size
  // side-rail entries and to recover a component:-1 placement's real size
  // -- see sizeOfPlacement above.
  //
  // Review fix: depended on [world] (the whole object) before -- world.
  // components is genuinely all this reads, but `world` itself is a NEW
  // object on every map drag/mousemove (onMouseMove's map-drag branch
  // calls setWorld every frame), which needlessly rebuilt this 1,209-entry
  // Map once per drag frame even though the component data driving it had
  // not changed. `world?.components` is the actual dependency.
  const sizeByMap = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    if (world) for (const c of world.components) if (c.maps.length === 1) m.set(c.maps[0]!, { width: c.bounds.width, height: c.bounds.height });
    return m;
  }, [world?.components]);

  // Singleton maps not currently in `placements` -- i.e. hidden by the
  // dungeon toggle being off (or not yet auto-placed). A map the user has
  // manually dragged onto the canvas already appears in `placements` (via
  // applySidecar's override, regardless of the toggle) and so drops out of
  // this list on its own.
  //
  // Review fix: also depended on [world] before, for the same needless-
  // rebuild-per-drag-frame reason as sizeByMap above (a ~1,028-item sort,
  // there). Unlike sizeByMap, this genuinely reads world.placements too
  // (not just .components) -- but only WHICH keys are present, never their
  // x/y, so `world?.placements.size` is enough to catch every change that
  // can actually move a name into or out of this list (a drop from the
  // rail, or the dungeon toggle) while still not reacting to a plain
  // reposition of an already-placed map, which never changes the key set
  // or the size. (`world?.components` alone -- mirroring sizeByMap exactly
  // -- would miss a drop from the rail: the dropped map's own component
  // entry does not change, only which of world.placements' keys it's
  // under, and the existing "lists singleton maps... lets one be dragged
  // onto the canvas" test below catches that regression concretely.)
  const unplacedNames = useMemo(() => {
    if (!world) return [] as string[];
    const out: string[] = [];
    for (const c of world.components) {
      const name = c.maps.length === 1 ? c.maps[0]! : undefined;
      if (name && !world.placements.has(name)) out.push(name);
    }
    return out.sort();
  }, [world?.components, world?.placements.size]);

  // Deliberately NOT auto-fit-to-the-whole-world on load: culling is what
  // makes 1,209 maps usable at all, and fitting the whole world into view
  // by definition puts every single placement's bounding box inside the
  // viewport, which would fetch all 1,209 source images on the very first
  // render -- the exact cost culling exists to avoid. The default view is
  // a modest, fixed zoom at the world origin; "Fit world" below is an
  // explicit action the user takes to reach an overview.
  //
  // That overview fits the connected landmasses/clusters, not literally
  // every placement, for the same underlying reason. Measured against the
  // live corpus: autoLayoutUnplaced's singleton shelf (Task 23) spans
  // roughly 25,600 tiles, while Hoenn+Johto+Kanto together span about 800
  // -- fitting the full extent zooms out more than 30x further than
  // needed, and "confirm Johto and Kanto read as continuous landmasses"
  // (this task's own Step 7) becomes impossible at that scale; they're a
  // few stray pixels. A singleton is any placement whose component has
  // exactly one map (the same test unplacedMapNames uses); excluding those
  // and fitting the rest is what actually shows "the world" as a navigable
  // place, matching spec §8.1's own framing rather than the letter of
  // "every placement".
  const fitWorld = useCallback(() => {
    if (!world) return;
    const landmasses = new Map(
      [...world.placements].filter(([, p]) => {
        const comp = componentOfPlacement(p, world.components);
        return comp !== null && comp.maps.length > 1;
      }),
    );
    const bounds = worldBoundsOf(landmasses.size > 0 ? landmasses : world.placements, sizeByMap);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const fit = computeFit(bounds, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [world, viewport, sizeByMap]);

  // Which jumpToken has already been handled -- either an actual jump was
  // performed for it, or it was determined there was nothing to jump to
  // (no jumpToMap, or that map has no current placement). A ref, not
  // state, because writing it must not itself trigger a re-render.
  //
  // Correctness fix, caught live by this feature's own test (Step 2's
  // "verify it fails" turned green for the wrong reason at first): the
  // plan's original effect depended on [jumpToken] alone, which fires
  // once at mount and never again unless jumpToken itself changes. That
  // is broken for the exact path a sidebar click most commonly takes --
  // select a map in Map mode, THEN switch to World mode -- because
  // WorldCanvas mounts FRESH at that point with jumpToMap/jumpToken
  // already non-default (App.tsx's selected/selectVersion carry over
  // across the mode switch), while `world` is still null (the /api/world
  // fetch is async and has not resolved yet). The effect ran once,
  // world was null, it returned early, and -- since jumpToken never
  // changes again on its own -- it never got a second chance once the
  // fetch landed. Depending on `world` too (not just jumpToken) lets the
  // effect retry the SAME still-unhandled token once world transitions
  // from null to loaded; the ref guard is what stops that same retry
  // from re-centring the view on every later drag frame, which also
  // produces a new `world` object (see sizeByMap's own comment on that)
  // but must not re-trigger an already-handled jump.
  const appliedJumpTokenRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (jumpToken === undefined || jumpToken === appliedJumpTokenRef.current) return;
    if (!jumpToMap || !world) return; // retry once `world` itself changes (see comment above)
    appliedJumpTokenRef.current = jumpToken;
    const p = world.placements.get(jumpToMap);
    if (!p) return;
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) return;
    // Feature A (spec §3.3): clicking a sidebar entry that has a real
    // placement but isn't drawn by default reveals it for this view -- a
    // "look," not a commit (contrast with dragging it onto the canvas,
    // which DOES persist, via the existing onDropOnCanvas/postPlacement
    // path). A map with no placement at all already returns above (`if
    // (!p) return`), matching spec §3.3's own "has nowhere to jump to;
    // clicking it does nothing." See drawnByDefault's own comment for why
    // its `?? ""` / `?? false` fallback is safe here.
    if (!drawnByDefault(p)) {
      setRevealedMaps((prev) => (prev.has(jumpToMap) ? prev : new Set(prev).add(jumpToMap)));
    }
    const fit = computeFit({ x: p.x, y: p.y, width: size.width, height: size.height }, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
    setJumpHighlight(jumpToMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sizeByMap
    // and viewport are read fresh each run but must not themselves
    // re-trigger a jump that's already been handled for this token; the
    // appliedJumpTokenRef guard above is what actually governs re-entry.
  }, [jumpToken, jumpToMap, world]);

  // Review fix: the 2s fade-out used to live INSIDE the jump-triggering
  // effect above, as a setTimeout whose cleanup was `clearTimeout(timer)`.
  // That effect also depends on `world` (see its own comment), which this
  // file churns on every single mousemove frame during a map/group drag
  // (onMouseMove's drag branches call setWorld per frame). So dragging ANY
  // map within the 2s fade window re-ran that effect: React always runs the
  // cleanup first (killing the pending fade timer), then the effect body
  // hit the appliedJumpTokenRef guard (this token was already handled) and
  // returned early -- WITHOUT scheduling a replacement timer. The outline
  // was then stuck visible forever. This effect is deliberately separate
  // and scoped only to `jumpHighlight` itself, which has a different
  // lifecycle from "a jump was requested": it owns clearing the highlight
  // after 2s no matter how many times `world` changes in between, and it
  // re-arms whenever `jumpHighlight` actually changes value -- e.g. a jump
  // to a DIFFERENT map gets a fresh 2s. (A re-jump to the SAME map name
  // sets state to the identical string, which React bails on, so this
  // effect's dep doesn't change and the original timer just keeps counting
  // down from the first jump -- it still fires and clears the highlight,
  // just not with a full fresh 2s from the second click. The `key`
  // fix below is what makes that second click visually restart the fade
  // animation regardless.)
  useEffect(() => {
    if (!jumpHighlight) return;
    const timer = setTimeout(() => setJumpHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [jumpHighlight]);

  // Culling: only placements whose tile-rect intersects the current
  // viewport (in world-tile space) are considered "visible". With 1,209
  // maps this is what keeps both the draw loop and the image-loading effect
  // below cheap regardless of how far out the user has zoomed.
  const visible = useMemo(() => {
    if (!world) return [] as Placement[];
    const x0 = -pan.x / zoom, y0 = -pan.y / zoom;
    const x1 = (viewport.w - pan.x) / zoom, y1 = (viewport.h - pan.y) / zoom;
    const out: Placement[] = [];
    for (const p of world.placements.values()) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue; // unrenderable orphan, see sizeOfPlacement
      // Feature A (spec §3.1): a placement not drawn by default (mapType in
      // HIDDEN_MAP_TYPES and never manually placed) stays hidden unless the
      // user has temporarily revealed it via a sidebar jump (see the jump
      // effect below). See drawnByDefault's own comment for why its
      // `?? ""` / `?? false` fallback is safe here too.
      //
      // Note for a later task touching badges: the draw effect's own
      // conflict-diamond and dive/emerge-triangle loops (below) iterate
      // world.conflicts/world.verticalLinks and look up world.placements
      // directly, bypassing this filter entirely -- so a badge could in
      // principle render for a map hidden by this same check. Currently
      // unreachable in practice (indoor/none-type maps connect via warps,
      // not planar `connections`, so they never appear in `conflicts` or
      // `verticalLinks`), but worth knowing before relying on "visible ==
      // everything a badge might touch".
      if (!drawnByDefault(p) && !revealedMaps.has(p.map)) continue;
      if (intersects(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) out.push(p);
    }
    return out;
  }, [world, pan, zoom, viewport, sizeByMap, revealedMaps]);

  // Feature A: how many CURRENTLY-PLACED maps are hidden by the same
  // mapType/manual filter `visible` just applied -- i.e. placed but not
  // drawn because neither shown by default nor revealed. Surfaced in the
  // status strip (below) so "placed" doesn't silently include invisible
  // interiors (~701 of them: 695 MAP_TYPE_INDOOR + 6 MAP_TYPE_NONE, per
  // visibility.ts's own count) with nothing explaining the gap. Mirrors
  // `visible`'s own non-zero-size guard for an apples-to-apples count of
  // what "hidden" actually means here (an unrenderable orphan is excluded
  // from both), but is deliberately NOT restricted to the current
  // viewport/intersects test -- a global count, matching how `placed` and
  // `unplaced` are themselves computed.
  const hiddenCount = useMemo(() => {
    if (!world) return 0;
    let n = 0;
    for (const p of world.placements.values()) {
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue;
      if (!drawnByDefault(p) && !revealedMaps.has(p.map)) n++;
    }
    return n;
  }, [world, sizeByMap, revealedMaps]);

  // Load (and cache) the source image for every visible placement that
  // doesn't have one yet. A placement already in imageCacheRef is never
  // refetched, and one outside `visible` is never requested at all -- this
  // is the whole culling guarantee in one effect.
  useEffect(() => {
    for (const p of visible) {
      if (imageCacheRef.current.has(p.map)) continue;
      const entry: ImageCacheEntry = { loaded: false };
      imageCacheRef.current.set(p.map, entry);
      const size = sizeOfPlacement(p, sizeByMap);
      const img = new Image();
      img.onload = () => {
        entry.loaded = true;
        entry.img = img;
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(size.width * TILE_PX * LOD_SCALE));
        small.height = Math.max(1, Math.round(size.height * TILE_PX * LOD_SCALE));
        const sctx = small.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(img, 0, 0, small.width, small.height);
        }
        entry.small = small;
        setCompositeVersion((v) => v + 1);
      };
      img.src = `/api/render/${encodeURIComponent(p.map)}.png`;
    }
  }, [visible, sizeByMap]);

  // Fetches each visible placement's encounter data at most once per map,
  // mirroring the image-loading effect just above exactly (same
  // cache-by-ref placeholder + version-bump-on-arrival shape). Unconditional
  // on the encounter gutter's own enabled state -- that toggle is
  // EncounterGutter's own local state, not lifted here, so it stays a
  // self-contained component; fetching for every visible map regardless
  // means turning the toggle on shows data immediately rather than kicking
  // off a fetch at that moment, the same "fetch what's visible, let a
  // toggle only control display" choice the image cache above already
  // makes.
  useEffect(() => {
    for (const p of visible) {
      if (encounterCacheRef.current.has(p.map)) continue;
      const entry: EncounterCacheEntry = { loaded: false };
      encounterCacheRef.current.set(p.map, entry);
      fetch(`/api/encounters/${encodeURIComponent(p.map)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`GET /api/encounters/${p.map} -> ${r.status}`);
          return r.json() as Promise<{ methods: EncounterGutterRow[] }>;
        })
        .then((d) => {
          entry.loaded = true;
          entry.methods = d.methods;
          setEncounterVersion((v) => v + 1);
        })
        .catch(() => {
          // Best-effort, matching the image cache's own posture: a failed
          // fetch just leaves this one map's gutter entry empty, not a
          // banner over an otherwise-working canvas. Still marked loaded so
          // this effect does not retry it forever.
          entry.loaded = true;
          setEncounterVersion((v) => v + 1);
        });
    }
  }, [visible]);

  // Screen-space rect per visible placement, in EncounterGutter's own prop
  // shape -- the exact same dx/dy/dw/dh formula the draw effect below uses
  // for each placement's own image blit, so the gutter always lines up with
  // the map it describes.
  const encounterEntries = useMemo<EncounterGutterMapEntry[]>(() => {
    return visible.map((p) => {
      const size = sizeOfPlacement(p, sizeByMap);
      const cache = encounterCacheRef.current.get(p.map);
      return {
        map: p.map,
        rect: { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom },
        methods: cache?.loaded ? (cache.methods ?? []) : undefined,
      };
    });
  }, [visible, sizeByMap, pan, zoom, encounterVersion]);

  // Task 29: species spotlight + coverage lenses. Both are DOM overlays,
  // not canvas draw calls -- the same "presentational rects positioned by
  // the exact dx/dy/dw/dh formula the encounter gutter's own `rect` prop
  // uses" split as encounterEntries just above, kept out of the imperative
  // draw effect below (already dense, and already the subject of several
  // review-fix postmortems in this file) rather than adding a second kind
  // of per-pixel drawing to it.

  // Map NAMES with no encounter table at all -- coverage()'s own
  // mapsWithoutEncounters is already keyed by name (proj.mapNames()
  // filtered), so this needs no id/name reconciliation, unlike
  // levelColorByMap below.
  const emptyMapNames = useMemo(
    () => new Set(coverageData?.mapsWithoutEncounters ?? []),
    [coverageData],
  );

  // mapName -> a blue(low)/red(high) colour string (spec §9's "Blue is
  // low, red is high"). Deliberately its OWN memo, keyed only on
  // `coverageData` -- coverageData is fetched once and never again (I8:
  // the project is read-only for all of Plan 1), so this runs once, not on
  // every pan/zoom frame the way lensOverlayEntries below necessarily
  // does.
  //
  // Review fix: this used to be a linear min-max scale across all 227
  // maps' averageLevel. That is technically correct but visually useless
  // for the design goal spec §9 actually states -- "look for maps that
  // jump several levels above their neighbours" -- because the corpus-wide
  // range (~2.5 to ~66.35) is set almost entirely by a handful of
  // post-game caves (Mt Silver, Cerulean Cave), while ~200 ordinary routes
  // actually span only about 3-31. A linear scale anchored on the true
  // extremes compresses that whole ordinary range into roughly the bottom
  // third of the ramp, so neighbouring routes a few levels apart end up
  // nearly the same shade -- confirmed live: Johto read as one shade with
  // a couple of outliers, not a gradient.
  //
  // Fixed by colouring on PERCENTILE RANK among all 227 levels instead of
  // the raw value: `t` is a map's position in the level-sorted list,
  // normalised to [0, 1]. This is still monotonic in level -- the lowest-
  // level map is always the most blue and the highest always the most
  // red, so "blue is low, red is high" still holds map-to-map -- but it
  // spreads colour across the FULL ramp everywhere real data actually
  // sits, rather than letting a few extreme outliers compress everything
  // else. Verified against the real corpus: Route101 (2.5, Johto's own
  // start) to Route28 (30.8, Johto's last route before Kanto) spans 0% to
  // 85% of the ramp by rank, vs only 0% to 44% under the old linear scale.
  //
  // Reads --overlay-elevation-low/--danger live via getComputedStyle, the
  // same call the conflict/dive/emerge badge colours in the draw effect
  // below already make -- but, unlike those (re-read every frame), this
  // is NOT reactive to a live theme toggle mid-session: it is computed
  // once, when coverageData arrives, and cached until coverageData itself
  // changes (never, in practice). Accepted as a minor imperfection for a
  // desktop tool not expected to flip theme mid-session, rather than
  // re-deriving 227 interpolated colours on every mouse-move frame for a
  // toggle nothing else in this file reacts to live either.
  const levelColorByMap = useMemo(() => {
    const out = new Map<string, string>();
    const entries = (coverageData?.levelByMap ?? []).filter(
      (e): e is typeof e & { mapName: string } => !!e.mapName,
    );
    if (entries.length === 0) return out;
    const sortedLevels = entries.map((e) => e.averageLevel).sort((a, b) => a - b);
    const n = sortedLevels.length;
    // Lowest index whose level is >= `level` -- a plain binary search
    // (sortedLevels is sorted ascending), not a linear scan, since this
    // runs once per entry (227 times) against a 227-length array.
    const rankOf = (level: number): number => {
      let lo = 0, hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedLevels[mid]! < level) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const low = parseHexColor(style?.getPropertyValue("--overlay-elevation-low").trim() || "#3b82f6");
    const high = parseHexColor(style?.getPropertyValue("--danger").trim() || "#ef4444");
    for (const e of entries) {
      const t = n > 1 ? rankOf(e.averageLevel) / (n - 1) : 0.5;
      out.set(e.mapName, lerpColor(low, high, t));
    }
    return out;
  }, [coverageData]);

  // Which non-land method (if any) a visible map's already-fetched
  // encounter rows include, reusing encounterCacheRef -- populated by the
  // effect above FOR the encounter gutter, but the data it holds (which
  // methods a map has) is exactly what the method lens also needs, so this
  // is a second reader of that same cache, not a second fetch. Water >
  // fishing > rock smash is a fixed display priority for a map with more
  // than one, not a ranking of importance.
  const methodTintFor = useCallback((map: string): string | null => {
    const rows = encounterCacheRef.current.get(map)?.methods;
    if (!rows) return null;
    if (rows.some((r) => r.method === "water_mons")) return "var(--encounter-water)";
    if (rows.some((r) => r.method === "fishing_mons")) return "var(--encounter-fishing)";
    if (rows.some((r) => r.method === "rock_smash_mons")) return "var(--encounter-rock-smash)";
    return null;
  }, []);

  const lensOverlayEntries = useMemo(() => {
    if (!lens) return [] as Array<{ map: string; rect: EncounterGutterMapEntry["rect"]; color: string }>;
    const out: Array<{ map: string; rect: EncounterGutterMapEntry["rect"]; color: string }> = [];
    for (const p of visible) {
      let color: string | null = null;
      if (lens === "level-curve") color = levelColorByMap.get(p.map) ?? null;
      else if (lens === "empty-maps") color = emptyMapNames.has(p.map) ? "var(--warn)" : null;
      else if (lens === "method") color = methodTintFor(p.map);
      // "unused-species" has no per-map visual -- see LensPanel's own
      // legend copy for that lens: it is a fact about species, not about a
      // place on the map, so there is nothing here to tint.
      if (!color) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      out.push({
        map: p.map,
        rect: { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom },
        color,
      });
    }
    return out;
    // encounterVersion, not encounterCacheRef itself (a ref, so it would
    // never usefully appear in a dependency array) -- the method lens
    // reads that ref via methodTintFor, and encounterVersion is exactly
    // the signal the encounter-fetch effect above already bumps whenever
    // that ref's contents change.
  }, [lens, visible, sizeByMap, pan, zoom, levelColorByMap, emptyMapNames, methodTintFor, encounterVersion]);

  // mapName -> its best (highest-percent) hit -- whereSpecies already
  // sorts by percent descending, so "first hit seen per map" is already
  // the right one; a map can appear more than once in `spotlightHits` (a
  // species reachable by two methods, or two variants) and only the
  // strongest showing is worth a badge.
  const spotlightByMap = useMemo(() => {
    const out = new Map<string, SpeciesHit>();
    if (!spotlightHits) return out;
    for (const h of spotlightHits) {
      if (!h.mapName) continue;
      const existing = out.get(h.mapName);
      if (!existing || h.percent > existing.percent) out.set(h.mapName, h);
    }
    return out;
  }, [spotlightHits]);

  const spotlightOverlayEntries = useMemo(() => {
    if (!spotlightHits) return [] as Array<{ map: string; rect: EncounterGutterMapEntry["rect"]; hit: SpeciesHit | null }>;
    return visible.map((p) => {
      const size = sizeOfPlacement(p, sizeByMap);
      return {
        map: p.map,
        rect: { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom },
        hit: spotlightByMap.get(p.map) ?? null,
      };
    });
  }, [spotlightHits, visible, sizeByMap, pan, zoom, spotlightByMap]);

  const selectionOverlayEntries = useMemo(() => {
    if (selected.size === 0) return [] as Array<{ map: string; rect: EncounterGutterMapEntry["rect"] }>;
    const out: Array<{ map: string; rect: EncounterGutterMapEntry["rect"] }> = [];
    for (const p of visible) {
      if (!selected.has(p.map)) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      out.push({ map: p.map, rect: { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom } });
    }
    return out;
  }, [selected, visible, sizeByMap, pan, zoom]);

  // LensPanel's empty-maps legend "next action" (spec §9: a legend states
  // what to do next, not just what colours mean). Reuses fitWorld's own
  // worldBoundsOf/computeFit pair AND its exact "connected landmasses only"
  // filter (componentOfPlacement(...).maps.length > 1) -- confirmed live
  // this filter is not optional here either: most of the 982 empty maps
  // are singleton interiors scattered across autoLayoutUnplaced's own
  // singleton shelf (fitWorld's own comment: ~25,600 tiles wide), so an
  // unfiltered bbox of every empty placement is dominated by that shelf and
  // zooms out to a single-digit percent showing nothing usable -- the same
  // failure mode fitWorld's own comment already documents and excludes
  // singletons to avoid. Restricting to landmass members still leaves a
  // real, useful view: most towns/routes' own interior buildings (empty)
  // sit inside a multi-map component together with their route.
  const focusEmptyMaps = useCallback(() => {
    if (!world) return;
    const empty = new Map(
      [...world.placements].filter(([name, p]) => {
        if (!emptyMapNames.has(name)) return false;
        const comp = componentOfPlacement(p, world.components);
        return comp !== null && comp.maps.length > 1;
      }),
    );
    const bounds = worldBoundsOf(empty.size > 0 ? empty : world.placements, sizeByMap);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const fit = computeFit(bounds, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [world, emptyMapNames, sizeByMap, viewport]);

  // The actual draw. Reads only from state already current in this render's
  // closure (never a stale ref captured by an earlier effect), so an image
  // that finishes loading after the user has since panned still lands in
  // the right place -- compositeVersion bumping is what re-runs this with
  // fresh pan/zoom, exactly mirroring MapCanvas's two-step
  // composite-then-blit split.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of visible) {
      const size = sizeOfPlacement(p, sizeByMap);
      const cache = imageCacheRef.current.get(p.map);
      if (!cache?.loaded) continue;
      const dx = p.x * zoom + pan.x, dy = p.y * zoom + pan.y;
      const dw = size.width * zoom, dh = size.height * zoom;
      const useSmall = zoom < LOD_ZOOM_THRESHOLD && cache.small;
      if (useSmall) ctx.drawImage(cache.small!, dx, dy, dw, dh);
      else if (cache.img) ctx.drawImage(cache.img, dx, dy, dw, dh);
    }

    if (!world) return;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const conflictColor = style?.getPropertyValue("--danger").trim() || "#ef4444";
    const diveColor = style?.getPropertyValue("--link-dive").trim() || "#3b82f6";
    const emergeColor = style?.getPropertyValue("--link-emerge").trim() || "#f97316";

    // Vertical links: 14 dive/emerge pairs with no planar meaning (excluded
    // from buildWorld's layout entirely) -- badged at the `from` map's
    // corner so they read as geometry rather than being invisible.
    for (const link of world.verticalLinks) {
      const p = world.placements.get(link.from);
      if (!p) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue;
      if (!intersects(p.x, p.y, size.width, size.height, -pan.x / zoom, -pan.y / zoom, (viewport.w - pan.x) / zoom, (viewport.h - pan.y) / zoom)) continue;
      const cx = p.x * zoom + pan.x + BADGE_SIZE;
      const cy = p.y * zoom + pan.y + size.height * zoom - BADGE_SIZE;
      drawTriangle(ctx, cx, cy, BADGE_SIZE, link.direction === "dive", link.direction === "dive" ? diveColor : emergeColor);
    }

    // Conflicts: a diamond at the offending map's top-right corner, plus a
    // hit-rect recorded for the hover tooltip below. Connection bugs become
    // visible as geometry -- these are never hidden behind a toggle.
    const badges: Array<{ x: number; y: number; text: string }> = [];
    for (const conflict of world.conflicts) {
      const p = world.placements.get(conflict.map);
      if (!p) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      if (size.width <= 0 || size.height <= 0) continue;
      const cx = p.x * zoom + pan.x + size.width * zoom - BADGE_SIZE;
      const cy = p.y * zoom + pan.y + BADGE_SIZE;
      drawDiamond(ctx, cx, cy, BADGE_SIZE, conflictColor);
      badges.push({
        x: cx,
        y: cy,
        text: `${conflict.map}: via ${conflict.viaA.from} (${conflict.viaA.x},${conflict.viaA.y}) disagrees with via ${conflict.viaB.from} (${conflict.viaB.x},${conflict.viaB.y})`,
      });
    }
    conflictBadgesRef.current = badges;
  }, [compositeVersion, pan, zoom, viewport, visible, world, sizeByMap]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);

  // A NATIVE listener with { passive: false }, not React's onWheel prop.
  // React attaches wheel listeners as passive by default (for scroll
  // performance), which makes e.preventDefault() inside a React onWheel
  // handler a silent no-op -- confirmed against the real running app, not
  // hypothetical: it logs "Unable to preventDefault inside passive event
  // listener invocation" and, more importantly, the PAGE scrolls
  // underneath the canvas at the same time the canvas is trying to zoom.
  // No jsdom-based test catches this (jsdom does not enforce passive
  // listener semantics the way a real browser does), which is exactly why
  // this project's own test-design rules call for actually running the UI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, e.deltaY < 0 ? zoom * WHEEL_FACTOR : zoom / WHEEL_FACTOR));
      const before = screenToWorld(sx, sy);
      setZoom(next);
      setPan({ x: sx - before.x * next, y: sy - before.y * next });
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [zoom, screenToWorld]);

  const hitTest = useCallback((wx: number, wy: number): Placement | null => {
    for (let i = visible.length - 1; i >= 0; i--) {
      const p = visible[i]!;
      const size = sizeOfPlacement(p, sizeByMap);
      if (wx >= p.x && wx < p.x + size.width && wy >= p.y && wy < p.y + size.height) return p;
    }
    return null;
  }, [visible, sizeByMap]);

  const postPlacement = (map: string, x: number, y: number) => {
    fetch("/api/world/placement", {
      method: "POST",
      body: JSON.stringify({ map, x, y }),
    })
      .then((r) => {
        // Review fix: fetch only rejects on a network-level failure -- a
        // 400 (e.g. a malformed body) or 500 (e.g. readSidecar's own I7
        // refusal on a corrupted world.json) resolves normally and landed
        // here silently discarded, with no banner and no console output.
        if (!r.ok) throw new Error(`POST /api/world/placement -> ${r.status}`);
      })
      .catch((e: unknown) => {
        // The optimistic local move already reflects the drag -- a failed
        // POST means it will not survive a reload, so this goes through
        // saveError (dismissible, does not disturb the canvas) rather than
        // loadError (which claims the whole world failed to load, over a
        // canvas that is working fine).
        setSaveError(e instanceof Error ? e.message : String(e));
      });
  };

  // Review fix: a plain mousedown used to start a map-drag whenever the
  // cursor happened to be over a placement, with no way to tell that
  // apart from "the user just wants to pan from here" -- and placements
  // cover most of the viewport (measured live: ~35% at the default zoom,
  // ~100% once panned inside a landmass), so panning was effectively
  // broken exactly where it matters most. A plain drag now ALWAYS pans,
  // matching every other map-like tool (Google Maps, Porymap's own
  // connection editor); moving a placement is the special case and
  // requires holding Shift while the drag starts over it -- surfaced to
  // the user via the hover status strip's "Shift+drag to move" hint
  // below, not left undiscoverable.
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragMovedRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (e.ctrlKey || e.metaKey) {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(hit.map)) next.delete(hit.map);
          else next.add(hit.map);
          return next;
        });
      } else {
        dragRef.current = { kind: "marquee", startX: sx, startY: sy };
        setMarqueeRect({ x0: sx, y0: sy, x1: sx, y1: sy });
      }
      return;
    }

    const hit = e.shiftKey ? hitTest(w.x, w.y) : null;
    if (hit) {
      if (selected.has(hit.map) && selected.size > 1) {
        const starts = new Map<string, { x: number; y: number }>();
        for (const name of selected) {
          const p = world?.placements.get(name);
          if (p) starts.set(name, { x: p.x, y: p.y });
        }
        dragRef.current = { kind: "group", anchorMap: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y, starts };
      } else {
        dragRef.current = { kind: "map", map: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y, startTileX: hit.x, startTileY: hit.y };
      }
      setIsDraggingMap(true);
    } else {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
  };

  // Review fix (CRITICAL): this used to rely on "the browser already
  // suppresses `click` after a real drag" -- that is false. A browser fires
  // `click` whenever mousedown and mouseup share the same target ELEMENT,
  // with no movement-distance suppression of any kind; confirmed live
  // against the real app, a 288x224px drag on the canvas still fired a
  // `click` afterward. Since a plain drag ALWAYS pans (mousedown starts a
  // "pan" drag whenever Shift is not held, regardless of what is under the
  // cursor -- see onMouseDown above), that click landed here unguarded and
  // silently rewrote the selection at the end of every ordinary pan: two
  // Ctrl+click-selected maps could drop to zero, or collapse to whichever
  // single map the pan happened to end over.
  //
  // dragMovedRef (reset to false at the top of onMouseDown, set to true by
  // onMouseMove whenever a drag is actually live) is what actually tells a
  // genuine click apart from the trailing click of a completed drag
  // gesture -- not element identity, which a drag and a click share.
  // Ctrl/Cmd+click and Shift+click are both handled entirely in
  // onMouseDown (toggle, or a map/group drag) and must not ALSO trigger
  // this plain-select behaviour, hence those parts of the guard.
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    setSelected(hit ? new Set([hit.map]) : new Set());
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    // Any live drag (pan/map/group/marquee) counts as real movement for
    // dragMovedRef's purpose -- see onCanvasClick's own comment for why.
    if (drag) dragMovedRef.current = true;
    if (drag?.kind === "pan") {
      setPan({ x: drag.startPan.x + (e.clientX - drag.startX), y: drag.startPan.y + (e.clientY - drag.startY) });
      return;
    }
    if (drag?.kind === "map") {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const nx = Math.round(w.x - drag.grabDX), ny = Math.round(w.y - drag.grabDY);
      setWorld((prev) => {
        if (!prev) return prev;
        const existing = prev.placements.get(drag.map);
        if (!existing || (existing.x === nx && existing.y === ny)) return prev;
        const next = new Map(prev.placements);
        next.set(drag.map, { ...existing, x: nx, y: ny });
        return { ...prev, placements: next };
      });
      setCompositeVersion((v) => v + 1);
      return;
    }
    if (drag?.kind === "group") {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const anchorStart = drag.starts.get(drag.anchorMap)!;
      const rawX = w.x - drag.grabDX, rawY = w.y - drag.grabDY;
      const dx = Math.round(rawX) - anchorStart.x, dy = Math.round(rawY) - anchorStart.y;
      setWorld((prev) => {
        if (!prev) return prev;
        // Review fix: mirrors the "map" branch's own no-op guard just above
        // -- skip creating a new `world` object (and re-running every
        // world-keyed useMemo, including the full placement cull) when the
        // anchor's rounded position has not actually changed since the last
        // update, the same sub-tile-mousemove waste sizeByMap/unplacedNames
        // were already fixed for.
        const anchorExisting = prev.placements.get(drag.anchorMap);
        if (!anchorExisting || (anchorExisting.x === anchorStart.x + dx && anchorExisting.y === anchorStart.y + dy)) return prev;
        const next = new Map(prev.placements);
        for (const [name, start] of drag.starts) {
          const existing = next.get(name);
          if (existing) next.set(name, { ...existing, x: start.x + dx, y: start.y + dy });
        }
        return { ...prev, placements: next };
      });
      setCompositeVersion((v) => v + 1);
      return;
    }
    if (drag?.kind === "marquee") {
      const rect = e.currentTarget.getBoundingClientRect();
      setMarqueeRect({ x0: drag.startX, y0: drag.startY, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
      return;
    }

    // Not dragging: hover for the status strip and conflict tooltips.
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
    setHover({ map: hit.map, component: componentOfPlacement(hit, world.components) });
  };

  // Review fix: extracted so onMouseLeaveCanvas can run the identical
  // commit check -- see its own comment below for why leaving the canvas
  // mid-drag needs this too, not just mouseup.
  const commitMapDrag = () => {
    const drag = dragRef.current;
    if (drag?.kind === "map") {
      const p = world?.placements.get(drag.map);
      // Review fix: only write when the placement actually landed on a
      // different tile than it started on -- a Shift+click (or a Shift+drag
      // that rounds back to the same tile) must not silently POST an
      // unchanged position and spend a write for nothing.
      if (p && (p.x !== drag.startTileX || p.y !== drag.startTileY)) postPlacement(drag.map, p.x, p.y);
    }
  };

  const commitGroupDrag = () => {
    const drag = dragRef.current;
    if (drag?.kind !== "group") return;
    for (const [name, start] of drag.starts) {
      const p = world?.placements.get(name);
      if (p && (p.x !== start.x || p.y !== start.y)) postPlacement(name, p.x, p.y);
    }
  };

  const commitMarquee = () => {
    const drag = dragRef.current;
    if (drag?.kind !== "marquee" || !marqueeRect) return;
    const draggedRight = marqueeRect.x1 > marqueeRect.x0;
    const wA = screenToWorld(marqueeRect.x0, marqueeRect.y0);
    const wB = screenToWorld(marqueeRect.x1, marqueeRect.y1);
    const x0 = Math.min(wA.x, wB.x), x1 = Math.max(wA.x, wB.x);
    const y0 = Math.min(wA.y, wB.y), y1 = Math.max(wA.y, wB.y);
    const hits = new Set<string>();
    for (const p of visible) {
      const size = sizeOfPlacement(p, sizeByMap);
      const test = draggedRight ? contains : intersects;
      if (test(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) hits.add(p.map);
    }
    setSelected(hits);
  };

  const onMouseUp = () => {
    commitMapDrag();
    commitGroupDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setMarqueeRect(null);
  };

  // Review fix: releasing a Shift+drag outside the canvas (toward the side
  // rail or the status bar is a completely normal gesture) used to clear
  // the drag state here WITHOUT running onMouseUp's commit logic -- the map
  // had already been moved visually (onMouseMove writes straight into
  // `world`), so it looked placed, but nothing was ever POSTed, and it
  // silently reverted on the next reload. Runs the exact same commit
  // onMouseUp does before clearing state, so this outcome now matches an
  // ordinary mouseup.
  //
  // onPointerDownCapture below (setPointerCapture) is the primary, more
  // robust fix in a real browser: once captured, mousemove/mouseup stay
  // targeted at the canvas even past its bounds -- or past the browser
  // window entirely -- until the button is released, so mouseleave
  // normally does not fire mid-drag at all, and the eventual commit
  // reflects wherever the button actually came up, not just wherever the
  // cursor first crossed the canvas edge. jsdom has no hit-testing/capture
  // model, so fireEvent.mouseLeave fires unconditionally in tests
  // regardless of any capture call -- which is exactly what makes this
  // fallback the one half of the fix a unit test can pin (see the "not
  // mouseup" test below); the capture half was confirmed by hand in a real
  // browser instead (setPointerCapture actually invoked and accepted --
  // canvas.hasPointerCapture(id) true immediately after a real pointerdown,
  // false again after the matching pointerup).
  const onMouseLeaveCanvas = () => {
    commitMapDrag();
    commitGroupDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setHover(null);
    setTooltip(null);
    setMarqueeRect(null);
  };

  // Review fix: captures the pointer so this gesture's mousemove/mouseup
  // (the browser's "compatibility mouse events" for the same pointer, per
  // the Pointer Events spec) stay targeted at the canvas even once the
  // cursor leaves its bounds -- or the browser window entirely -- until the
  // button is released. Best-effort: absence or failure here just means
  // this gesture falls back to onMouseLeaveCanvas's own commit-on-leave
  // handling above, not a crash.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some environments (older browsers, non-mouse pointer types) may
      // not support or allow capture here -- see the comment above.
    }
  };

  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "Escape") setSelected(new Set());
  };

  const onDragOverCanvas = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  const onDropOnCanvas = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const map = e.dataTransfer.getData("text/plain");
    if (!map) return;
    const size = sizeByMap.get(map);
    if (!size) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const x = Math.round(w.x - size.width / 2), y = Math.round(w.y - size.height / 2);
    setWorld((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.placements);
      next.set(map, { map, x, y, width: size.width, height: size.height, component: -1 });
      return { ...prev, placements: next };
    });
    setCompositeVersion((v) => v + 1);
    postPlacement(map, x, y);
  };

  const stageClassName = `world-canvas__stage${isDraggingMap ? " world-canvas__stage--dragging-map" : ""}`;

  return (
    <section className="world-canvas" aria-label="World canvas">
      <div className="world-canvas__toolbar">
        <div className="world-canvas__toolbar-group">
          <button
            type="button"
            role="switch"
            aria-checked={dungeonsOn}
            aria-label="Dungeon auto-layout"
            className="world-canvas__switch"
            onClick={toggleDungeons}
          >
            <span className="world-canvas__switch-thumb" />
          </button>
          <span className="world-canvas__dungeon-label">Dungeon auto-layout {dungeonsOn ? "on" : "off"}</span>
        </div>
        <div className="world-canvas__toolbar-group world-canvas__toolbar-group--grow">
          <SpeciesSpotlight onHits={setSpotlightHits} />
          {/* Review fix: a failed /api/coverage fetch used to fall through
              to LensPanel anyway via `?? 0`, rendering "0 maps have no
              encounters" as if that were a real, checked answer. A failed
              fetch replaces the lens controls with a visible error instead
              -- SpeciesSpotlight above is unaffected (it hits
              /api/where/:species directly, not /api/coverage), so a
              coverage failure degrades only the lenses, not the spotlight. */}
          {coverageError ? (
            <span className="world-canvas__toolbar-error" role="alert">
              Coverage lenses unavailable: {coverageError}
            </span>
          ) : (
            <LensPanel
              active={lens}
              onChange={setLens}
              summary={{
                emptyMaps: coverageData?.mapsWithoutEncounters.length ?? 0,
                unusedSpecies: coverageData?.unusedSpecies.length ?? 0,
              }}
              onListEmptyMaps={focusEmptyMaps}
            />
          )}
        </div>
        <div className="world-canvas__toolbar-group">
          <span className="world-canvas__zoom-readout">{Math.round((zoom / TILE_PX) * 100)}%</span>
          <button type="button" className="map-canvas__btn" onClick={fitWorld}>
            Fit world
          </button>
        </div>
      </div>

      <div className="world-canvas__legend">
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--conflict" /> Conflict
        </span>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--dive" /> Dive
        </span>
        <span className="world-canvas__legend-item">
          <i className="world-canvas__swatch world-canvas__swatch--emerge" /> Emerge
        </span>
      </div>

      <div className="world-canvas__body">
        <div className="world-canvas__viewport" ref={containerRef}>
          {loadError ? (
            <p className="app__canvas-placeholder">Could not load the world: {loadError}</p>
          ) : !world ? (
            <p className="app__canvas-placeholder">Loading world…</p>
          ) : null}
          <canvas
            ref={canvasRef}
            className={stageClassName}
            width={viewport.w}
            height={viewport.h}
            onPointerDown={onPointerDownCapture}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onClick={onCanvasClick}
            onKeyDown={onCanvasKeyDown}
            tabIndex={0}
            onMouseLeave={onMouseLeaveCanvas}
            onDragOver={onDragOverCanvas}
            onDrop={onDropOnCanvas}
          />
          <EncounterGutter maps={encounterEntries} zoom={zoom} />
          {selectionOverlayEntries.length > 0 && (
            <div className="world-canvas__selection" aria-hidden="true">
              {selectionOverlayEntries.map((e) => (
                <div
                  key={e.map}
                  className="world-canvas__selection-outline"
                  data-map={e.map}
                  style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height }}
                />
              ))}
            </div>
          )}
          {jumpHighlight && world?.placements.get(jumpHighlight) && (() => {
            const p = world.placements.get(jumpHighlight)!;
            const size = sizeOfPlacement(p, sizeByMap);
            const rect = { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom };
            return (
              <div className="world-canvas__selection" aria-hidden="true">
                {/* Review fix: keyed on jumpToken (not jumpToMap), which
                    bumps on every jump including a re-click of the same map
                    name. Without this, jumping to the same map twice in a
                    row reused the exact same DOM node -- and since the CSS
                    fade animation is `forwards` and had already run to
                    completion once, it did not restart on the second jump,
                    so the highlight silently failed to appear at all. The
                    key forces React to mount a fresh node per jump, so the
                    animation genuinely restarts every time. */}
                <div
                  key={jumpToken}
                  className="world-canvas__selection-outline world-canvas__jump-highlight"
                  style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                />
              </div>
            );
          })()}
          {marqueeRect && (
            <div
              className="world-canvas__marquee"
              style={{
                left: Math.min(marqueeRect.x0, marqueeRect.x1),
                top: Math.min(marqueeRect.y0, marqueeRect.y1),
                width: Math.abs(marqueeRect.x1 - marqueeRect.x0),
                height: Math.abs(marqueeRect.y1 - marqueeRect.y0),
              }}
            />
          )}
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
          {tooltip && (
            <div className="world-canvas__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
              {tooltip.text}
            </div>
          )}
          {saveError && (
            <div className="world-canvas__toast" role="alert">
              <span className="world-canvas__toast-text">{saveError}</span>
              <button
                type="button"
                className="world-canvas__toast-dismiss"
                onClick={() => setSaveError(null)}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
        </div>

        <UnplacedRail unplacedNames={unplacedNames} filter={railFilter} onFilterChange={setRailFilter} />
      </div>

      <div className="world-canvas__status">
        <span className="world-canvas__status-item">
          placed <strong>{world ? world.placements.size : 0}</strong> · hidden <strong>{hiddenCount}</strong> · unplaced{" "}
          <strong>{unplacedNames.length}</strong> · conflicts <strong>{world ? world.conflicts.length : 0}</strong>
        </span>
        {hover ? (
          <span className="world-canvas__status-item world-canvas__hover">
            {hover.map}
            {hover.component ? ` · ${hover.component.maps.length}-map component` : " · manual placement (unknown component)"}
            {" · Shift+drag to move"}
          </span>
        ) : (
          <span className="world-canvas__status-item world-canvas__hover world-canvas__hover--empty">Hover the world…</span>
        )}
      </div>
    </section>
  );
}

interface UnplacedRailProps {
  unplacedNames: string[];
  filter: string;
  onFilterChange: (value: string) => void;
}

/**
 * Review fix: this used to be built inline inside WorldCanvas's own render,
 * so canvas-state churn that has nothing to do with the rail -- pan and
 * hover state, both updated at pointer frequency by onMouseMove -- forced a
 * full re-render and re-reconciliation of all 1,028 <li> rows (the live
 * corpus's unplaced-singleton count with the dungeon toggle off) on every
 * single frame. That defeats Task 25's own "panning stays smooth"
 * acceptance criterion in exactly the one mode (dungeons off) this rail
 * exists to serve -- likely missed by prior spec-review passes because the
 * default sidecar has dungeons ON, where the rail is empty.
 *
 * Wrapped in React.memo and given only the three props it actually needs
 * (the raw unplaced-names list, the current filter string, and a
 * filter-change callback -- NOT a pre-filtered list, so the filtering
 * itself also lives here, out of WorldCanvas's own per-render work), so a
 * pan or hover update -- which changes neither -- leaves this whole subtree
 * untouched. `onFilterChange` must stay a `useState` setter passed straight
 * through by its caller (never a fresh inline arrow function) for the memo
 * comparison to actually hold across those unrelated re-renders.
 */
export const UnplacedRail = memo(function UnplacedRail({ unplacedNames, filter, onFilterChange }: UnplacedRailProps) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? unplacedNames.filter((n) => n.toLowerCase().includes(q)) : unplacedNames;
  }, [unplacedNames, filter]);

  return (
    <aside className="world-canvas__rail" aria-label="Unplaced maps">
      <div className="world-canvas__rail-header">
        <span className="world-canvas__rail-title">Unplaced</span>
        <span className="world-canvas__rail-count">{unplacedNames.length}</span>
      </div>
      <input
        className="world-canvas__rail-filter"
        placeholder="Filter…"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="world-canvas__rail-empty">
          {unplacedNames.length === 0 ? "Every map is placed." : `No matches for “${filter}”.`}
        </p>
      ) : (
        <ul className="world-canvas__rail-list">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="world-canvas__rail-item"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
});

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pointDown: boolean, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (pointDown) {
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.lineTo(cx, cy + size);
  } else {
    ctx.moveTo(cx - size, cy + size);
    ctx.lineTo(cx + size, cy + size);
    ctx.lineTo(cx, cy - size);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
}

/** `#rrggbb` -> `[r, g, b]`, for the level-curve lens's blue/red
 *  interpolation (levelColorByMap above) -- falls back to white on
 *  anything that doesn't parse, rather than throwing over a CSS variable
 *  that failed to resolve (e.g. jsdom in a test, or a stylesheet not yet
 *  loaded). */
function parseHexColor(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [255, 255, 255];
}

/** Linear RGB interpolation between `a` and `b` at `t` (clamped to
 *  [0, 1]) -- deliberately plain RGB lerp, not perceptual (Lab/LCH)
 *  interpolation: the spec's own required copy is "Blue is low, red is
 *  high", a two-point read, not a request for a perceptually-uniform
 *  ramp across many steps. */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = Math.min(1, Math.max(0, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * c);
  const g = Math.round(a[1] + (b[1] - a[1]) * c);
  const bl = Math.round(a[2] + (b[2] - a[2]) * c);
  return `rgb(${r}, ${g}, ${bl})`;
}
