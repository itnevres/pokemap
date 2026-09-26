import { describe, it, expect } from "vitest";
import { createRaster, type RGBA } from "../../../src/render/raster.js";
import {
  drawGbcGrid,
  drawGbcCollision,
  drawGbcEvents,
  gbcStepInfo,
  type GbcQuadrantKey,
} from "../../../src/gbc/render/overlays.js";
import type { GbcMapPayload } from "../../../src/gbc/wire.js";
import type { GbcMapEvents, Block, Collision } from "../../../src/gbc/model/types.js";
import { openGbcProject } from "../../../src/gbc/project.js";
import { loadGbcMapEvents, outOfBoundsEventDefects } from "../../../src/gbc/load/events.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

const WALL: RGBA = { r: 220, g: 40, b: 40, a: 110 };
const WATER: RGBA = { r: 6, g: 182, b: 212, a: 110 };

/**
 * A tiny synthetic map: 1 block wide, 1 block tall (so the step grid is
 * exactly 2x2 -- one step per quadrant, no ambiguity about which cell a
 * (sx,sy) lands in), one metatile (id 0) whose 4 quadrants each carry a
 * DISTINCT raw COLL_* value (Plan 0 §7: "give every field in a fixture a
 * distinct value") -- tl=wall, tr=land, bl=water, br=a SECOND wall value
 * (distinct from tl's, but the same category), so a quadrant-key mixup
 * between tl/br (both "wall") is still visible via the raw `value`, and a
 * tr/bl mixup (the swapped-parity mutation this task's own mutation-check
 * list names) is visible via both `value` AND `category` (land vs water).
 */
function fixturePayload(): GbcMapPayload {
  const collision: Collision[] = [{ tl: 7, tr: 0, bl: 41, br: 12 }];
  const blocks: Block[] = [{ metatileId: 0 }];
  return {
    family: "gbc",
    map: {
      name: "Fixture",
      constName: "FIXTURE",
      group: 1,
      number: 1,
      width: 1,
      height: 1,
      blkPath: "maps/Fixture.blk",
      tileset: "TILESET_FIXTURE",
      environment: "ENVIRONMENT_TOWN",
      landmark: "LANDMARK_NONE",
      music: "MUSIC_NONE",
      phoneFlag: "0",
      palette: "PAL_MAP_TOWN",
      fishGroup: "0",
      border: 3,
      connectionFlags: "0",
      connections: [],
    },
    layout: { blkPath: "maps/Fixture.blk", width: 1, height: 1, writable: true },
    blocks,
    metatileCount: 1,
    tileset: { constName: "TILESET_FIXTURE", name: "TilesetFixture" },
    collision,
    collisionInfo: {
      "7": { name: "COLL_WALL", category: "wall", talk: false },
      "0": { name: "COLL_FLOOR", category: "land", talk: false },
      "41": { name: "COLL_WATER", category: "water", talk: false },
      "12": { name: "COLL_BR_WALL", category: "wall", talk: true },
    },
    events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
    defects: [],
    paddingWidth: 3,
  };
}

function emptyEvents(overrides: Partial<GbcMapEvents> = {}): GbcMapEvents {
  return { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [], ...overrides };
}

describe("drawGbcGrid", () => {
  it("draws lines only inside the map area, not across the border ring", () => {
    // A 1x1-block map with a 1-block border: raster is (1+2)*32 = 96 square,
    // origin (32,32), map area exactly 32x32. A grid line at step 32 with
    // `x < w` (w=32) only fires once, at x=0 relative to origin -- i.e. at
    // absolute x=32 -- so the border ring (0..32 and 64..96) must stay
    // completely untouched.
    const r = createRaster(96, 96);
    drawGbcGrid(r, 32, 32, 1, 1);
    // Every pixel in the border ring (outside [32,64)) is still fully
    // transparent (blendRect never touched it).
    const corners: [number, number][] = [[0, 0], [95, 0], [0, 95], [95, 95], [32, 0], [0, 32]];
    for (const [x, y] of corners) {
      const i = (y * 96 + x) * 4;
      expect(r.data[i + 3]).toBe(0);
    }
    // The map area's own top-left corner (32,32) IS on both grid lines.
    const i = (32 * 96 + 32) * 4;
    expect(r.data[i + 3]).not.toBe(0);
  });
});

describe("drawGbcCollision", () => {
  const payload = fixturePayload();

  it("a no-collision (all-land) cell is byte-identical to the base (Plan 0 §7)", () => {
    const allLand = { ...payload, collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }] };
    const base = createRaster(64, 64);
    base.data.fill(200); // arbitrary non-zero "photo" content to prove nothing touches it
    const r = createRaster(64, 64);
    r.data.set(base.data);
    drawGbcCollision(r, 0, 0, allLand, { wall: WALL, water: WATER });
    expect(r.data).toEqual(base.data);
  });

  it("blends exactly the wall quadrant's own 16x16 area, nothing else", () => {
    const r = createRaster(64, 64);
    drawGbcCollision(r, 0, 0, payload, { wall: WALL, water: WATER });

    // tl (0,0)-(15,15): blended (alpha > 0).
    expect(r.data[((0 * 64 + 0) * 4) + 3]).toBeGreaterThan(0);
    expect(r.data[((15 * 64 + 15) * 4) + 3]).toBeGreaterThan(0);
    // tr (16,0)-(31,15): land, untouched.
    expect(r.data[((0 * 64 + 16) * 4) + 3]).toBe(0);
    // bl (0,16)-(15,31): water, blended.
    expect(r.data[((16 * 64 + 0) * 4) + 3]).toBeGreaterThan(0);
    // br (16,16)-(31,31): a SECOND wall value, also blended.
    expect(r.data[((16 * 64 + 16) * 4) + 3]).toBeGreaterThan(0);
    // Outside the one 32x32 block entirely: untouched.
    expect(r.data[((40 * 64 + 40) * 4) + 3]).toBe(0);
  });

  it("mutation check: tinting land quadrants would blend the tr cell -- confirmed it does NOT", () => {
    const r = createRaster(64, 64);
    drawGbcCollision(r, 0, 0, payload, { wall: WALL, water: WATER });
    for (let y = 0; y < 16; y++) {
      for (let x = 16; x < 32; x++) {
        expect(r.data[((y * 64 + x) * 4) + 3]).toBe(0);
      }
    }
  });
});

describe("drawGbcEvents", () => {
  it("draws only in-bounds events, in object/warp/coord/bg order", () => {
    const events = emptyEvents({
      objects: [{ x: 0, y: 0, sprite: "SPRITE_A", moveData: "M", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "S", eventFlag: "-1", lineIndex: 0 }],
      warps: [{ x: 1, y: 0, mapConst: "SOME_MAP", destWarp: 1, lineIndex: 1 }],
    });
    const r = createRaster(32, 16);
    const colors = { object: { r: 60, g: 200, b: 90, a: 150 }, warp: { r: 240, g: 190, b: 40, a: 150 }, coord: { r: 200, g: 80, b: 240, a: 150 }, bg: { r: 60, g: 160, b: 240, a: 150 } };
    const marks = drawGbcEvents(r, 0, 0, events, 2, 1, colors);
    expect(marks).toEqual([
      { kind: "object", index: 0, sx: 0, sy: 0, label: "SPRITE_A" },
      { kind: "warp", index: 0, sx: 1, sy: 0, label: "→ SOME_MAP" },
    ]);
    expect(r.data[3]).toBeGreaterThan(0); // (0,0) painted
    expect(r.data[(16 * 4) + 3]).toBeGreaterThan(0); // (1,0) painted
  });

  it("mutation check: an out-of-bounds event is never drawn or returned", () => {
    const events = emptyEvents({
      warps: [{ x: 99, y: 99, mapConst: "OOB_MAP", destWarp: 1, lineIndex: 0 }],
    });
    const r = createRaster(32, 32);
    const colors = { object: WALL, warp: WALL, coord: WALL, bg: WALL };
    const marks = drawGbcEvents(r, 0, 0, events, 2, 2, colors);
    expect(marks).toEqual([]);
    expect(r.data.every((b) => b === 0)).toBe(true);
  });
});

/**
 * A 2x2-block map (spec review finding 4: every prior fixture here used a
 * 1x1-block map at origin 0, so a dropped origin, a transposed block index,
 * or 16-px-instead-of-32-px block spacing all happened to still land on the
 * "right" pixel and passed anyway). Origin 32 (a real 1-block border ring).
 * Every block carries a DISTINCT metatile id AND a distinct collision
 * configuration, chosen so `X1`-`X6` (`mutate.mjs`) are each individually
 * discriminated:
 * - block (0,0), id 0: all land -- a control area that must stay untouched.
 * - block (1,0), id 1: BL = wall. Its BL quadrant is at absolute pixels
 *   (64..79, 48..63) -- if the origin is dropped (X1) or blocks are spaced
 *   16px apart (X2), that exact region goes untouched instead.
 * - block (0,1), id 2: TR = water, a DIFFERENT collision shape from block
 *   (1,0)'s -- transposing the block index (X4, `blocks[bx*height+by]`)
 *   would swap which of these two configs each of (1,0)/(0,1) reads, so
 *   block (1,0)'s expected wall tint would silently read block (0,1)'s
 *   all-land-except-TR shape instead and vanish.
 * - block (1,1), id 3: all land -- a second control area, and also the
 *   block one in-bounds warp event's step (3,3) falls in.
 */
function fixturePayload2x2(): GbcMapPayload {
  const collision: Collision[] = [
    { tl: 0, tr: 0, bl: 0, br: 0 }, // id 0: all land
    { tl: 0, tr: 0, bl: 7, br: 0 }, // id 1: BL wall
    { tl: 0, tr: 41, bl: 0, br: 0 }, // id 2: TR water
    { tl: 0, tr: 0, bl: 0, br: 0 }, // id 3: all land
  ];
  const blocks: Block[] = [{ metatileId: 0 }, { metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }];
  const base = fixturePayload();
  return {
    ...base,
    map: { ...base.map, width: 2, height: 2 },
    layout: { ...base.layout, width: 2, height: 2 },
    blocks,
    metatileCount: 4,
    collision,
    collisionInfo: {
      "0": { name: "COLL_FLOOR", category: "land", talk: false },
      "7": { name: "COLL_WALL", category: "wall", talk: false },
      "41": { name: "COLL_WATER", category: "water", talk: false },
    },
    events: {
      warps: [{ x: 3, y: 3, mapConst: "X", destWarp: 1, lineIndex: 0 }],
      coords: [],
      bgs: [],
      objects: [],
      sceneScripts: [],
      callbacks: [],
      objectConsts: [],
    },
  };
}

const ORIGIN = 32;
const RASTER_SIZE = 128; // origin (32) + 2 blocks*32 (64) + margin

describe("geometry at origin 32 (2x2-block map, spec review finding 4)", () => {
  it("drawGbcGrid: a line at the block boundary (origin+32), none at origin+16 (kills X6)", () => {
    const r = createRaster(RASTER_SIZE, RASTER_SIZE);
    drawGbcGrid(r, ORIGIN, ORIGIN, 2, 2);
    const alphaAt = (x: number, y: number) => r.data[(y * RASTER_SIZE + x) * 4 + 3];
    // The real block boundary between block 0 and block 1, partway down the first row.
    expect(alphaAt(ORIGIN + 32, ORIGIN + 5)).toBeGreaterThan(0);
    // A 16-px STEP boundary that is NOT a 32-px BLOCK boundary -- a grid
    // drawn every 16px (X6) would wrongly paint a line here too.
    expect(alphaAt(ORIGIN + 16, ORIGIN + 5)).toBe(0);
  });

  it("drawGbcCollision: exact tinted pixel positions, distinct wall/water RGB, and untouched controls (kills X1-X4)", () => {
    const payload = fixturePayload2x2();
    const r = createRaster(RASTER_SIZE, RASTER_SIZE);
    drawGbcCollision(r, ORIGIN, ORIGIN, payload, { wall: WALL, water: WATER });
    const pixelAt = (x: number, y: number) => {
      const i = (y * RASTER_SIZE + x) * 4;
      return { r: r.data[i], g: r.data[i + 1], b: r.data[i + 2], a: r.data[i + 3] };
    };

    // Block (1,0)'s BL quadrant: absolute (64..79, 48..63). Exact wall RGB
    // (blendRect onto a fully-transparent base reproduces the source colour
    // exactly, see this file's own real-corpus test for the same fact).
    expect(pixelAt(70, 55)).toEqual({ r: WALL.r, g: WALL.g, b: WALL.b, a: WALL.a });
    // Block (0,1)'s TR quadrant: absolute (48..63, 64..79). Water RGB, and
    // NOT the wall colour (X3).
    const waterPixel = pixelAt(55, 70);
    expect(waterPixel).toEqual({ r: WATER.r, g: WATER.g, b: WATER.b, a: WATER.a });
    expect([waterPixel.r, waterPixel.g, waterPixel.b]).not.toEqual([WALL.r, WALL.g, WALL.b]);

    // Control: block (0,0) (all land) and block (1,1) (all land) both
    // stay fully transparent.
    expect(pixelAt(40, 40).a).toBe(0);
    expect(pixelAt(90, 90).a).toBe(0);
  });

  it("drawGbcEvents: exact tinted pixel position for the in-bounds warp at step (3,3) (kills X5)", () => {
    const payload = fixturePayload2x2();
    const r = createRaster(RASTER_SIZE, RASTER_SIZE);
    const colors = { object: WALL, warp: { r: 240, g: 190, b: 40, a: 150 }, coord: WALL, bg: WALL };
    drawGbcEvents(r, ORIGIN, ORIGIN, payload.events, 4, 4, colors);
    // step (3,3) -> absolute (32+3*16, 32+3*16) = (80, 80), a 16x16 region.
    const i = (85 * RASTER_SIZE + 85) * 4;
    expect([r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]]).toEqual([240, 190, 40, 150]);
    // Dropping the origin (X5) would paint at (48,48) instead -- confirm
    // that position is untouched.
    const jDroppedOrigin = (53 * RASTER_SIZE + 53) * 4;
    expect(r.data[jDroppedOrigin + 3]).toBe(0);
  });
});

describe("gbcStepInfo", () => {
  const payload = fixturePayload();

  it("returns null outside the 2x2 step grid", () => {
    expect(gbcStepInfo(payload, -1, 0)).toBeNull();
    expect(gbcStepInfo(payload, 0, -1)).toBeNull();
    expect(gbcStepInfo(payload, 2, 0)).toBeNull();
    expect(gbcStepInfo(payload, 0, 2)).toBeNull();
  });

  it("pins the quadrant mapping for all four parities: (sx&1)+2*(sy&1), never 2*(sx&1)+(sy&1)", () => {
    const cases: { sx: number; sy: number; quadrant: GbcQuadrantKey; value: number; category: string }[] = [
      { sx: 0, sy: 0, quadrant: "tl", value: 7, category: "wall" },
      { sx: 1, sy: 0, quadrant: "tr", value: 0, category: "land" },
      { sx: 0, sy: 1, quadrant: "bl", value: 41, category: "water" },
      { sx: 1, sy: 1, quadrant: "br", value: 12, category: "wall" },
    ];
    for (const c of cases) {
      const info = gbcStepInfo(payload, c.sx, c.sy)!;
      expect(info.quadrant).toBe(c.quadrant);
      expect(info.quadrants[c.quadrant].value).toBe(c.value);
      expect(info.quadrants[c.quadrant].category).toBe(c.category);
    }
  });

  it("reports every quadrant's info regardless of which one is hovered", () => {
    const info = gbcStepInfo(payload, 0, 0)!;
    expect(info.quadrants).toEqual({
      tl: { value: 7, name: "COLL_WALL", category: "wall", talk: false },
      tr: { value: 0, name: "COLL_FLOOR", category: "land", talk: false },
      bl: { value: 41, name: "COLL_WATER", category: "water", talk: false },
      br: { value: 12, name: "COLL_BR_WALL", category: "wall", talk: true },
    });
  });

  it("rendersAsBorder is true only for metatile id 0, and carries the map's own border id", () => {
    const withId0 = { ...payload, blocks: [{ metatileId: 0 }], collision: [payload.collision[0]!, { tl: 0, tr: 0, bl: 0, br: 0 }] };
    const info0 = gbcStepInfo(withId0, 0, 0)!;
    expect(info0.rendersAsBorder).toBe(true);
    expect(info0.border).toBe(3); // fixturePayload's map.border

    // Mutation check: dropping rendersAsBorder must be a visible regression --
    // a real block whose id is NOT 0 must report false.
    const nonZero = { ...payload, blocks: [{ metatileId: 5 }], collision: [...Array(5).fill({ tl: 0, tr: 0, bl: 0, br: 0 }), payload.collision[0]!] };
    const infoNonZero = gbcStepInfo(nonZero, 0, 0)!;
    expect(infoNonZero.rendersAsBorder).toBe(false);
    expect(infoNonZero.metatileId).toBe(5);
  });

  it("lists every event at this exact step, in object/warp/coord/bg order, and none at an empty step", () => {
    const withEvents: GbcMapPayload = {
      ...payload,
      layout: { ...payload.layout, width: 2, height: 2 },
      blocks: [{ metatileId: 0 }, { metatileId: 0 }, { metatileId: 0 }, { metatileId: 0 }],
      events: emptyEvents({
        warps: [{ x: 2, y: 2, mapConst: "M", destWarp: 1, lineIndex: 0 }],
        bgs: [{ x: 2, y: 2, bgEventType: "BGEVENT_READ", script: "S", lineIndex: 0 }],
        objects: [{ x: 0, y: 0, sprite: "SPRITE_X", moveData: "M", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "S", eventFlag: "-1", lineIndex: 0 }],
      }),
    };
    const hit = gbcStepInfo(withEvents, 2, 2)!;
    expect(hit.events).toEqual([
      { kind: "warp", index: 0, sx: 2, sy: 2, label: "→ M" },
      { kind: "bg", index: 0, sx: 2, sy: 2, label: "BGEVENT_READ" },
    ]);
    const miss = gbcStepInfo(withEvents, 3, 3)!;
    expect(miss.events).toEqual([]);
  });
});

describe("real-corpus case: NewBarkTown", () => {
  itWithGbcCorpus("step (11,13) resolves to warp index 3 -> ELMS_HOUSE, quadrant br", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("NewBarkTown");
    const { layout } = proj.layout(map);
    const ts = proj.tileset(map.tileset);
    const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
    // Built the same shape `buildGbcMapPayload` (packages/server/src/gbcRoutes.ts)
    // produces, without importing the server package (core must not depend
    // on server -- the dependency runs the other way).
    const usedValues = new Set<number>();
    for (const c of ts.collision) { usedValues.add(c.tl); usedValues.add(c.tr); usedValues.add(c.bl); usedValues.add(c.br); }
    const collisionInfoAll = proj.collisionInfo();
    const collisionInfo: GbcMapPayload["collisionInfo"] = {};
    for (const v of usedValues) {
      const entry = collisionInfoAll.get(v);
      if (entry) collisionInfo[String(v)] = entry;
    }
    const payload: GbcMapPayload = {
      family: "gbc",
      map,
      layout: { blkPath: layout.blkPath, width: layout.width, height: layout.height, writable: layout.writable },
      blocks: layout.blocks,
      metatileCount: ts.metatiles.length,
      tileset: { constName: ts.constName, name: ts.name },
      collision: ts.collision,
      collisionInfo,
      events,
      defects: [],
      paddingWidth: proj.paddingWidth(),
    };

    const info = gbcStepInfo(payload, 11, 13)!;
    expect(info).not.toBeNull();
    expect(info.bx).toBe(5);
    expect(info.by).toBe(6);
    expect(info.quadrant).toBe("br");
    expect(info.events).toEqual([{ kind: "warp", index: 3, sx: 11, sy: 13, label: "→ ELMS_HOUSE" }]);
    // Measured (see this task's own live-check script): metatile 20, TL/TR/BL
    // wall, BR a land "door" tile.
    expect(info.metatileId).toBe(20);
    expect(info.quadrants.tl.category).toBe("wall");
    expect(info.quadrants.br.category).toBe("land");
  });
});

describe("real-corpus case: CeruleanCave2F", () => {
  itWithGbcCorpus("drawGbcEvents marks exclude its 3 out-of-bounds warps", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("CeruleanCave2F");
    const { events } = loadGbcMapEvents(GBC_SUBJECT_ROOT, map);
    const oob = outOfBoundsEventDefects(map, events);
    expect(oob).toHaveLength(3); // re-measured, matches the plan's own pinned fact

    const stepW = 2 * map.width;
    const stepH = 2 * map.height;
    const r = createRaster(stepW * 16, stepH * 16);
    const colors = { object: WALL, warp: WALL, coord: WALL, bg: WALL };
    const marks = drawGbcEvents(r, 0, 0, events, stepW, stepH, colors);
    const warpMarks = marks.filter((m) => m.kind === "warp");
    // 6 real warp_events total, 3 out of bounds -> 3 drawable.
    expect(events.warps).toHaveLength(6);
    expect(warpMarks).toHaveLength(3);
    for (const m of warpMarks) {
      expect(m.sx).toBeLessThan(stepW);
      expect(m.sy).toBeLessThan(stepH);
      expect(m.sx).toBeGreaterThanOrEqual(0);
      expect(m.sy).toBeGreaterThanOrEqual(0);
    }
  });
});
