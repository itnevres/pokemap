import { describe, it, expect } from "vitest";
import { openProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { drawGrid, drawCollision, drawElevation, drawEvents } from "../../src/render/overlays.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

/**
 * Independently-reasoned source-over blend (not imported from raster.ts --
 * copying the implementation's own formula into its test would just prove
 * the code agrees with itself). Used to pin overlays to an *exact* resulting
 * colour, not merely "some pixel changed" -- the defect class flagged after
 * a real bug (a missing `viewport` dependency in MapCanvas, unrelated to
 * this file) shipped past every test here that only asserted motion. Valid
 * only where the destination is known fully opaque, which every pixel
 * `renderLayout` produces within its own bounds is (every block blits an
 * opaque metatile), so `da = 1` and `out = 1` always hold here.
 */
function blendOverOpaque(base: readonly [number, number, number], overlay: { r: number; g: number; b: number; a: number }) {
  const sa = overlay.a / 255;
  const mix = (b: number, o: number) => Math.round(o * sa + b * (1 - sa));
  return [mix(base[0], overlay.r), mix(base[1], overlay.g), mix(base[2], overlay.b)] as const;
}

function pixelAt(r: { width: number; data: Uint8ClampedArray | Buffer }, x: number, y: number) {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!] as const;
}

describe("overlays", () => {
  itWithCorpus("drawGrid only touches pixels on 16px boundaries", () => {
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    const before = Buffer.from(r.data);
    drawGrid(r, 16);

    // Interior pixels of every cell must be untouched...
    let interior = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        if (x % 16 === 0 || y % 16 === 0) continue;
        const i = (y * r.width + x) * 4;
        if (before[i] !== r.data[i] || before[i + 1] !== r.data[i + 1] || before[i + 2] !== r.data[i + 2]) interior++;
      }
    }
    expect(interior).toBe(0);

    // ...and the lines must actually have been drawn. Checking only that the
    // interior is unchanged passes against a drawGrid with an empty body,
    // which is the whole failure mode this test exists to prevent. Every pixel
    // on a boundary changes, because the map is opaque everywhere and the wash
    // is white at a=40.
    let onLines = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        if (x % 16 !== 0 && y % 16 !== 0) continue;
        const i = (y * r.width + x) * 4;
        if (before[i] !== r.data[i] || before[i + 1] !== r.data[i + 1] || before[i + 2] !== r.data[i + 2]) onLines++;
      }
    }
    expect(onLines).toBeGreaterThan(0);

    // Pinned, not just "changed": the pixel at a grid boundary must land on
    // the exact colour a white wash at a=40 over its own original colour
    // produces -- not merely a different colour (a wrong overlay constant
    // would still make `onLines` above pass). (16, 3): on the vertical line
    // at x=16 but not on any horizontal line, so it gets exactly one blend
    // pass -- unlike a corner such as (0,0), which sits on both the
    // vertical and horizontal line drawGrid paints and so is blended twice.
    const [bx, by] = [16, 3];
    const beforePx = pixelAt({ width: r.width, data: before }, bx, by);
    const [er, eg, eb] = blendOverOpaque([beforePx[0], beforePx[1], beforePx[2]], { r: 255, g: 255, b: 255, a: 40 });
    expect(pixelAt(r, bx, by)).toEqual([er, eg, eb, 255]);
  });

  itWithCorpus("drawCollision tints exactly the blocked cells and nothing else", () => {
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    expect(r.blocks.length).toBe(900);
    const blocked = r.blocks.filter((b) => b.collision !== 0).length;
    expect(blocked).toBe(429);

    const before = Buffer.from(r.data);
    drawCollision(r);

    // "does not throw" would pass against a function with an empty body. Count
    // the cells whose centre pixel actually changed and match it to the data.
    let changed = 0;
    for (let by = 0; by < r.blockHeight; by++) {
      for (let bx = 0; bx < r.blockWidth; bx++) {
        const px = r.originX + bx * 16 + 8;
        const py = r.originY + by * 16 + 8;
        const i = (py * r.width + px) * 4;
        if (before[i] !== r.data[i] || before[i + 1] !== r.data[i + 1] || before[i + 2] !== r.data[i + 2]) changed++;
      }
    }
    expect(changed).toBe(blocked);

    // Pinned, not just "changed count matches": a blocked cell's centre
    // pixel must land on the exact tint the collision colour (a=110 red)
    // produces over its own original colour, and stay fully opaque -- and
    // an unblocked cell's centre pixel must be byte-for-byte identical to
    // the base image, not merely "close" or "not wildly different". Both
    // halves matter: a version that tinted every cell (Task 21's teeth-proof
    // break) would fail the second; a version that tinted the right cells
    // the wrong colour would pass `changed === blocked` above but fail the
    // first.
    const firstBlocked = r.blocks.findIndex((b) => b.collision !== 0);
    const bx1 = firstBlocked % r.blockWidth, by1 = Math.floor(firstBlocked / r.blockWidth);
    const px1 = r.originX + bx1 * 16 + 8, py1 = r.originY + by1 * 16 + 8;
    const beforeBlocked = pixelAt({ width: r.width, data: before }, px1, py1);
    const [er, eg, eb] = blendOverOpaque([beforeBlocked[0], beforeBlocked[1], beforeBlocked[2]], { r: 220, g: 40, b: 40, a: 110 });
    expect(pixelAt(r, px1, py1)).toEqual([er, eg, eb, 255]);

    const firstUnblocked = r.blocks.findIndex((b) => b.collision === 0);
    const bx0 = firstUnblocked % r.blockWidth, by0 = Math.floor(firstUnblocked / r.blockWidth);
    const px0 = r.originX + bx0 * 16 + 8, py0 = r.originY + by0 * 16 + 8;
    expect(pixelAt(r, px0, py0)).toEqual(pixelAt({ width: r.width, data: before }, px0, py0));
  });

  itWithCorpus("drawElevation washes every cell (including elevation 0), tinted toward the exact level colour", () => {
    // Unlike drawCollision, drawElevation has no "skip this value" case --
    // elevation 0 is a real level (the player keeps their current
    // elevation), not a sentinel the way collision 0 is, so every cell
    // must change. This test did not exist before; a completely empty
    // `drawElevation` body would have shipped undetected.
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    const before = Buffer.from(r.data);
    drawElevation(r);

    let changed = 0;
    for (let by = 0; by < r.blockHeight; by++) {
      for (let bx = 0; bx < r.blockWidth; bx++) {
        const px = r.originX + bx * 16 + 8;
        const py = r.originY + by * 16 + 8;
        const [br, bg, bb] = pixelAt({ width: r.width, data: before }, px, py);
        const [ar, ag, ab, aa] = pixelAt(r, px, py);
        if (br !== ar || bg !== ag || bb !== ab) changed++;
        expect(aa, `cell (${bx},${by}) must stay opaque`).toBe(255);
      }
    }
    expect(changed).toBe(r.blockWidth * r.blockHeight);

    // Pinned exact colour for two distinct elevation values, so a formula
    // that used the wrong axis (e.g. swapped r/b, or a wrong divisor) would
    // be caught rather than merely "some tint was applied".
    for (const elevation of [0, 1, 3] as const) {
      const idx = r.blocks.findIndex((b) => b.elevation === elevation);
      expect(idx, `no block with elevation ${elevation} on PetalburgCity -- pick a different fixture value`).toBeGreaterThanOrEqual(0);
      const bx = idx % r.blockWidth, by = Math.floor(idx / r.blockWidth);
      const px = r.originX + bx * 16 + 8, py = r.originY + by * 16 + 8;
      const beforePx = pixelAt({ width: r.width, data: before }, px, py);
      const v = Math.round((elevation / 15) * 255);
      const [er, eg, eb] = blendOverOpaque([beforePx[0], beforePx[1], beforePx[2]], { r: v, g: 0, b: 255 - v, a: 90 });
      expect(pixelAt(r, px, py), `elevation ${elevation}`).toEqual([er, eg, eb, 255]);
    }
  });

  itWithCorpus("drawEvents marks all four event kinds distinctly", () => {
    // PetalburgCity, not CeladonCity. Celadon has 0 coord events, so a test
    // written against it asserts 0 === 0 for that kind and would pass against a
    // drawEvents that dropped coord events entirely. Petalburg has all four:
    // 11 objects, 6 warps, 8 coord, 8 bg -- measured.
    const r = renderLayout(proj, proj.layoutForMap("PetalburgCity").name);
    const map = proj.map("PetalburgCity");
    const before = Buffer.from(r.data);
    const marks = drawEvents(r, map);

    for (const [kind, expected] of [
      ["object", map.objectEvents.length],
      ["warp", map.warpEvents.length],
      ["coord", map.coordEvents.length],
      ["bg", map.bgEvents.length],
    ] as const) {
      expect(expected, `${kind} fixture is empty, so this assertion proves nothing`).toBeGreaterThan(0);
      expect(marks.filter((m) => m.kind === kind).length, kind).toBe(expected);
    }

    // Returning the marks is not the same as painting them.
    expect(Buffer.from(r.data).equals(before)).toBe(false);

    // Pinned exact colour per kind, on one mark each, not just "the pixel
    // changed": each event kind has its own colour, and a version that drew
    // every mark in one shared colour (or the wrong colour for a kind)
    // would still pass every assertion above.
    const colour = {
      object: { r: 60, g: 200, b: 90, a: 150 },
      warp: { r: 240, g: 190, b: 40, a: 150 },
      coord: { r: 200, g: 80, b: 240, a: 150 },
      bg: { r: 60, g: 160, b: 240, a: 150 },
    } as const;
    for (const kind of ["object", "warp", "coord", "bg"] as const) {
      const mark = marks.find((m) => m.kind === kind)!;
      const px = r.originX + mark.x * 16 + 8;
      const py = r.originY + mark.y * 16 + 8;
      const beforePx = pixelAt({ width: r.width, data: before }, px, py);
      const [er, eg, eb] = blendOverOpaque([beforePx[0], beforePx[1], beforePx[2]], colour[kind]);
      expect(pixelAt(r, px, py), kind).toEqual([er, eg, eb, 255]);
    }
  });
});
