import { describe, it, expect } from "vitest";
import { openProject } from "../../src/project.js";
import { renderLayout } from "../../src/render/layout.js";
import { drawGrid, drawCollision, drawEvents } from "../../src/render/overlays.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

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
  });
});
