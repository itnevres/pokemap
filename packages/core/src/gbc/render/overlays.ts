/**
 * GBC map-view overlays (Plan 6b Task 4) -- the GBC counterpart of
 * `core/render/overlays.ts`, which `MapCanvas.tsx` composites through.
 * Reuses that module's `blendRect`/`RGBA` primitives directly rather than
 * redeclaring them, but does NOT reuse `drawGrid`/`drawCollision`/
 * `drawEvents` themselves -- those are typed against GBA's `LayoutRaster`
 * (which folds `originX`/`originY`/`blockWidth`/`blockHeight` into the
 * raster object itself) and operate on a GBA `Block` with its own
 * `collision`/`elevation` fields, neither of which this format has (GBC
 * collision is a per-TILESET property, 4 quadrants per metatile -- see
 * `model/types.ts`'s own `Block`/`Collision` doc comments). Every function
 * below instead takes a plain `Raster` (`render/raster.ts`) plus
 * `originX`/`originY` explicitly, and reads collision/event data off a
 * `GbcMapPayload`-shaped object (or, for `drawGbcEvents`, the `GbcMapEvents`
 * it draws directly).
 *
 * Two grids (Plan 6b "Resolved design questions" -> "Other decisions", "Event
 * coordinates are in 16-px steps, not 32-px blocks"): `drawGbcGrid` draws at
 * 32-px BLOCK boundaries (one line per metatile edge); `drawGbcCollision`/
 * `drawGbcEvents`/`gbcStepInfo` all operate on the 16-px STEP grid
 * (`2*width x 2*height`), the unit real event coordinates and collision
 * quadrants are actually expressed in.
 */
import { blendRect, type RGBA, type Raster } from "../../render/raster.js";
import type { GbcMapEvents } from "../model/types.js";
import type { GbcMapPayload, GbcCollisionCategory } from "../wire.js";

/** Mirrors `core/render/overlays.ts`'s own hardcoded `GRID` constant
 *  (`rgba(255,255,255,0.16)`-ish, `a: 40` of 255) -- not read from a CSS
 *  token at composite time the way collision/event colours are (see
 *  `GbcMapCanvas.tsx`'s own doc comment): GBA's grid overlay is the same
 *  fixed hardcoded hue in both themes, and GBC's grid mirrors that instead
 *  of inventing a themed variant GBA itself doesn't have. */
const GRID: RGBA = { r: 255, g: 255, b: 255, a: 40 };

/**
 * Draws 32-px block-boundary lines over the map area only (`wBlocks x
 * hBlocks` blocks, starting at `(originX, originY)`) -- NOT across the
 * border ring outside it, unlike GBA's `drawGrid`, which draws across its
 * raster's full width/height because GBA's raster IS the layout with no
 * separate border region folded into the same image the way GBC's
 * `?border=1` render is. Same boundary convention as GBA's `drawGrid`
 * (`for (x = 0; x < extent; x += step)`): a line at every block's own
 * top/left edge, none at the far bottom/right edge of the last block.
 */
export function drawGbcGrid(r: Raster, originX: number, originY: number, wBlocks: number, hBlocks: number): void {
  const w = wBlocks * 32;
  const h = hBlocks * 32;
  for (let x = 0; x < w; x += 32) blendRect(r, originX + x, originY, 1, h, GRID);
  for (let y = 0; y < h; y += 32) blendRect(r, originX, originY + y, w, 1, GRID);
}

/** Quadrant -> pixel offset within its own 32x32 block, per `GetCoordTile`'s
 *  own order (GBC format findings §3.3): index 0 (x even, y even) = top-left,
 *  +1 (x odd) = top-right, +2 (y odd) = bottom-left, +3 (both odd) =
 *  bottom-right. `gbcStepInfo` below derives the same index the same way. */
const QUADRANT_OFFSET: Record<"tl" | "tr" | "bl" | "br", { dx: number; dy: number }> = {
  tl: { dx: 0, dy: 0 },
  tr: { dx: 16, dy: 0 },
  bl: { dx: 0, dy: 16 },
  br: { dx: 16, dy: 16 },
};
const QUADRANT_KEYS = ["tl", "tr", "bl", "br"] as const;
export type GbcQuadrantKey = (typeof QUADRANT_KEYS)[number];

/**
 * Tints wall quadrants with `colors.wall` and water quadrants with
 * `colors.water`, one 16x16 `blendRect` per quadrant -- land quadrants are
 * left completely untouched (Plan 0 §7's own lesson, restated in this task's
 * spec: "a no-collision cell is byte-identical to the base"), never blended
 * with a fully-transparent colour, which would still perturb the pixel data
 * even at alpha 0 in principle and is exactly the class of "it changed to
 * something, just not visibly" bug that lesson warns about.
 *
 * Reads `payload.collision[metatileId]` for each block's 4 raw `COLL_*`
 * values, then `payload.collisionInfo[String(value)]` for each value's
 * category -- both already scoped to this map by `buildGbcMapPayload`
 * (`collisionInfo` holds only the values this tileset's collision table
 * actually uses), so a lookup miss (defensive only; the real payload always
 * has an entry for every value `collision` can produce) falls back to
 * `"land"`, the only category that draws nothing.
 *
 * **Known gap, deliberately left as-is (spec review finding 8, a Plan 7
 * concern):** the real engine's `GetCoordTile` (`home/map.asm:1717-1719`
 * `and a / jr z, .nope`, `:1744-1746` `.nope: ld a, -1 / ret`) returns `-1`
 * ($FF, a wall) for block id **0** without ever indexing its tileset's
 * collision table at all. This function instead looks up
 * `payload.collision[0]` like any other id -- for Johto that resolves to
 * `COLL_01` (land), not a wall. The corpus has zero id-0 map blocks today
 * (independently re-verified, see Task 1b/4's own reports), so nothing
 * renders wrong in practice; `gbcStepInfo` below has the identical gap for
 * the same reason. Plan 7's painting must special-case id 0 to $FF rather
 * than copying this function's own lookup for it.
 */
export function drawGbcCollision(
  r: Raster,
  originX: number,
  originY: number,
  payload: Pick<GbcMapPayload, "layout" | "blocks" | "collision" | "collisionInfo">,
  colors: { wall: RGBA; water: RGBA },
): void {
  const { width, height } = payload.layout;
  for (let by = 0; by < height; by++) {
    for (let bx = 0; bx < width; bx++) {
      const block = payload.blocks[by * width + bx];
      if (!block) continue;
      const coll = payload.collision[block.metatileId];
      if (!coll) continue;
      for (const key of QUADRANT_KEYS) {
        const value = coll[key];
        const category: GbcCollisionCategory = payload.collisionInfo[String(value)]?.category ?? "land";
        if (category === "land") continue;
        const color = category === "wall" ? colors.wall : colors.water;
        const { dx, dy } = QUADRANT_OFFSET[key];
        blendRect(r, originX + bx * 32 + dx, originY + by * 32 + dy, 16, 16, color);
      }
    }
  }
}

export type GbcEventKind = "object" | "warp" | "coord" | "bg";

/** One drawn (or hover-resolvable) event marker -- `index` is this event's
 *  own position within its OWN kind's array (`GbcMapEvents.warps[index]`,
 *  etc.), matching `GbcMapEvents`'s own doc comment that these arrays are
 *  never resorted. `label` is the same short descriptive text GBA's own
 *  `EventMark.label` carries for its warp case (`→ ${destMap}`) -- for GBC,
 *  every kind gets an equivalent real, identifying field (`sprite`/
 *  `mapConst`/`sceneConst`/`bgEventType`), never a placeholder string the
 *  way GBA's own coord case ("trigger") has to fall back to. */
export interface GbcEventMark {
  kind: GbcEventKind;
  index: number;
  sx: number;
  sy: number;
  label: string;
}

function inStepBounds(x: number, y: number, stepW: number, stepH: number): boolean {
  return x >= 0 && y >= 0 && x < stepW && y < stepH;
}

/**
 * Every IN-BOUNDS event mark, in object/warp/coord/bg order (matching GBA's
 * own draw order, `core/render/overlays.ts`'s `drawEvents`) -- an
 * out-of-bounds event (G4's 7 real corpus cases, `outOfBoundsEventDefects`)
 * is skipped here entirely, never appended with a clamped position: it is
 * "never drawn and never hit-tested" (Plan 6b's own decision), and the
 * defect banner, not this list, is what surfaces it. Shared by
 * `drawGbcEvents` (which also paints each mark) and `gbcStepInfo` (which
 * only needs to know what's AT one particular step, never draws anything).
 */
function collectGbcEventMarks(events: GbcMapEvents, stepW: number, stepH: number): GbcEventMark[] {
  const marks: GbcEventMark[] = [];
  const add = (kind: GbcEventKind, index: number, x: number, y: number, label: string) => {
    if (inStepBounds(x, y, stepW, stepH)) marks.push({ kind, index, sx: x, sy: y, label });
  };
  events.objects.forEach((e, i) => add("object", i, e.x, e.y, e.sprite));
  events.warps.forEach((e, i) => add("warp", i, e.x, e.y, `→ ${e.mapConst}`));
  events.coords.forEach((e, i) => add("coord", i, e.x, e.y, e.sceneConst));
  events.bgs.forEach((e, i) => add("bg", i, e.x, e.y, e.bgEventType));
  return marks;
}

/**
 * Draws every in-bounds event as one 16x16 `blendRect`, object/warp/coord/bg
 * order (so bg paints last and is visually topmost on any overlap, mirroring
 * GBA's own `drawEvents`), and returns the marks so the UI can reuse them
 * (`GbcMapCanvas` does not currently need to -- hover goes through
 * `gbcStepInfo` directly, independent of whether this overlay is even
 * toggled on -- but returning them keeps this function's shape symmetrical
 * with GBA's `drawEvents`, which the UI DOES rely on for hit-testing).
 */
export function drawGbcEvents(
  r: Raster,
  originX: number,
  originY: number,
  events: GbcMapEvents,
  stepW: number,
  stepH: number,
  colors: Record<GbcEventKind, RGBA>,
): GbcEventMark[] {
  const marks = collectGbcEventMarks(events, stepW, stepH);
  for (const m of marks) blendRect(r, originX + m.sx * 16, originY + m.sy * 16, 16, 16, colors[m.kind]);
  return marks;
}

/** One collision quadrant's resolved display info -- `value` is the raw
 *  `COLL_*` byte, `name`/`category`/`talk` come straight off
 *  `GbcMapPayload.collisionInfo[String(value)]` (falling back to `null`/
 *  `"land"`/`false` only defensively; every value a real payload's
 *  `collision` table can produce always has an entry there). */
export interface GbcQuadrantInfo {
  value: number;
  name: string | null;
  category: GbcCollisionCategory;
  talk: boolean;
}

export interface GbcStepInfo {
  bx: number;
  by: number;
  sx: number;
  sy: number;
  metatileId: number;
  /** True when `metatileId === 0` -- the corpus has no such block today, but
   *  the render path still substitutes the map's own border metatile for it
   *  (`renderGbcMap`'s own doc comment, Plan 6b "Block id 0"), so the hover
   *  strip must say so rather than claiming id 0 is real, painted data. */
  rendersAsBorder: boolean;
  /** The map's own border metatile id (`GbcMap.border`) -- what `id 0`
   *  actually renders as, shown alongside `rendersAsBorder`. */
  border: number;
  quadrant: GbcQuadrantKey;
  quadrants: Record<GbcQuadrantKey, GbcQuadrantInfo>;
  /** Every event (of any kind) whose step is exactly `(sx, sy)`, in
   *  object/warp/coord/bg order -- empty when none. An out-of-bounds event
   *  can never appear here: it fails `collectGbcEventMarks`'s own bounds
   *  check before this filter even runs, so there is nothing to
   *  additionally exclude for a `(sx, sy)` this function was even called
   *  with (which is itself always in-bounds -- see the early return below). */
  events: GbcEventMark[];
}

/**
 * Pure hover resolver: `(sx, sy)` (16-px steps) -> everything the status
 * strip needs, or `null` outside the `2*width x 2*height` step grid. Step
 * `(sx, sy)` is in block `(sx>>1, sy>>1)`; its quadrant index is
 * `(sx&1) + 2*(sy&1)` (`GetCoordTile`, GBC format findings §3.3 -- see
 * `QUADRANT_OFFSET`'s own doc comment for the derivation), which is NOT
 * `2*(sx&1) + (sy&1)` -- the two are easy to transpose and only disagree on
 * the two "one coordinate odd" cases (tr vs. bl swap), which is exactly why
 * this task's own mutation-check list names swapping them explicitly.
 *
 * Shares `drawGbcCollision`'s own known id-0 gap (see that function's doc
 * comment): a hovered step on metatile id 0 reports `payload.collision[0]`'s
 * real quadrant values, not the engine's actual $FF-for-every-quadrant
 * behaviour. `rendersAsBorder` at least tells the caller id 0 is special;
 * the quadrant VALUES it reports for that case are not what the engine
 * would return.
 */
export function gbcStepInfo(payload: GbcMapPayload, sx: number, sy: number): GbcStepInfo | null {
  const stepW = 2 * payload.layout.width;
  const stepH = 2 * payload.layout.height;
  if (!inStepBounds(sx, sy, stepW, stepH)) return null;

  const bx = sx >> 1;
  const by = sy >> 1;
  const block = payload.blocks[by * payload.layout.width + bx];
  const metatileId = block ? block.metatileId : 0;
  const coll = payload.collision[metatileId];

  const quadrantInfo = (key: GbcQuadrantKey): GbcQuadrantInfo => {
    const value = coll ? coll[key] : 0;
    const info = payload.collisionInfo[String(value)];
    return { value, name: info?.name ?? null, category: info?.category ?? "land", talk: info?.talk ?? false };
  };
  const quadrants: Record<GbcQuadrantKey, GbcQuadrantInfo> = {
    tl: quadrantInfo("tl"),
    tr: quadrantInfo("tr"),
    bl: quadrantInfo("bl"),
    br: quadrantInfo("br"),
  };

  const quadrantIndex = (sx & 1) + 2 * (sy & 1);
  const quadrant = QUADRANT_KEYS[quadrantIndex]!;

  const events = collectGbcEventMarks(payload.events, stepW, stepH).filter((m) => m.sx === sx && m.sy === sy);

  return {
    bx,
    by,
    sx,
    sy,
    metatileId,
    rendersAsBorder: metatileId === 0,
    border: payload.map.border,
    quadrant,
    quadrants,
    events,
  };
}
