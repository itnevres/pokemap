import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseBlocks, encodeBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const PROFILE = defaultProfile("pokeemerald");
const G = SUBJECT_ROOT;

describe("parseBlocks", () => {
  it("decodes id, collision and elevation from a u16", () => {
    const buf = Buffer.alloc(2);
    // elevation 3 (0x3000), collision 1 (0x0400), id 0x123
    buf.writeUInt16LE(0x3000 | 0x0400 | 0x123, 0);
    const [b] = parseBlocks(buf, PROFILE);
    expect(b).toEqual({ metatileId: 0x123, collision: 1, elevation: 3 });
  });

  itWithCorpus("reads NewBarkTown's real map.bin", () => {
    // `metatileId <= 0x3ff` and `elevation <= 15` cannot fail -- both are masked
    // to those widths on the way out, so they hold for any input whatsoever.
    // Measured values instead.
    const blocks = parseBlocks(readFileSync(`${G}/data/layouts/NewBarkTown/map.bin`), PROFILE);
    expect(blocks).toHaveLength(1170);
    expect(blocks.slice(0, 6)).toEqual([
      { metatileId: 20, collision: 1, elevation: 0 },
      { metatileId: 21, collision: 1, elevation: 0 },
      { metatileId: 20, collision: 1, elevation: 0 },
      { metatileId: 19, collision: 1, elevation: 0 },
      { metatileId: 120, collision: 0, elevation: 3 },
      { metatileId: 121, collision: 0, elevation: 3 },
    ]);
    expect(blocks.filter((b) => b.collision !== 0)).toHaveLength(807);
    expect(blocks.reduce((t, b) => t + b.elevation, 0)).toBe(1073);
  });

  itWithCorpus("the three fields are independent -- a wrong shift moves them together", () => {
    // Across all 869,988 blocks in the tree, collision only ever takes 0 or 1
    // (despite a 2-bit mask) and elevation takes 10 of its 16 possible values.
    // A shift that was off by even one bit would smear those distributions.
    //
    // The counts moved on 2026-08-30 because the subject tree changed, not the
    // parser: LAYOUT_NAVEL_ROCK_ZYGARDE_CHAMBER was resized in Porymap from
    // 11x9 to 30x22, adding exactly 561 blocks. Every delta below sums to that
    // 561 -- collision +308/+253, elevation +547 on 0 and +14 on 3 -- and the
    // shape is unchanged: still only two collision values, still the same ten
    // elevation values. Re-derived with bit maths written outside parseBlocks,
    // since asserting the loader's own output back at it proves nothing.
    const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
    const col = new Map<number, number>(), elev = new Map<number, number>();
    for (const l of layouts) {
      for (const f of [l.blockdata_filepath, l.border_filepath]) {
        for (const b of parseBlocks(readFileSync(`${G}/${f}`), PROFILE)) {
          col.set(b.collision, (col.get(b.collision) ?? 0) + 1);
          elev.set(b.elevation, (elev.get(b.elevation) ?? 0) + 1);
        }
      }
    }
    expect([...col.entries()].sort((a, b) => a[0] - b[0])).toEqual([[0, 397250], [1, 472738]]);
    expect([...elev.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 493832], [1, 109599], [2, 722], [3, 242177], [4, 16536],
      [5, 5060], [6, 418], [7, 845], [9, 112], [15, 687],
    ]);
  }, 300_000);

  itWithCorpus("19 layouts carry one trailing block beyond width * height", () => {
    // This asserted `bad).toEqual([])` in an earlier draft, which is simply not
    // true of the data. 19 layouts have exactly one extra block in map.bin, and
    // the extra word is 0x0000 in every case. It is inherited from upstream --
    // vanilla pokeemerald has 20 such layouts, expansion 20, modern-emerald 19,
    // pokeclassic 21 -- so it is a generation artifact of these stub layouts,
    // not corruption in this tree.
    //
    // Harmless for rendering, which indexes width * height and ignores the
    // tail. NOT harmless for writing: a writer that rebuilds the file from a
    // width x height grid drops two bytes from each of these, which is exactly
    // the class of damage invariant I5 exists to prevent. See Plan 2 Task 2.
    const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
    const over: { name: string; diff: number; tail: number }[] = [];

    for (const l of layouts) {
      const buf = readFileSync(`${G}/${l.blockdata_filepath}`);
      const diff = buf.length / 2 - l.width * l.height;
      if (diff !== 0) over.push({ name: l.name, diff, tail: buf.readUInt16LE(buf.length - 2) });
    }

    expect(over).toHaveLength(19);
    expect(over.every((o) => o.diff === 1)).toBe(true);
    expect(over.every((o) => o.tail === 0)).toBe(true);
    expect(over.map((o) => o.name)).toContain("UnusedContestRoom1_Layout");
    expect(over.map((o) => o.name)).toContain("CaveOfOrigin_Unused_B4F_Lava_Layout");
    // Never short. A file with fewer blocks than its dimensions would break
    // the renderer, and none does.
    expect(over.every((o) => o.diff > 0)).toBe(true);
  });

  itWithCorpus("border.bin always matches borderWidth * borderHeight exactly", () => {
    // No tolerance here -- borders are the data Porymap is documented to have
    // shrunk on this tree, so any drift is a finding rather than a quirk.
    const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
    const bad: string[] = [];
    for (const l of layouts) {
      const expected = (l.border_width ?? 2) * (l.border_height ?? 2);
      if (readFileSync(`${G}/${l.border_filepath}`).length / 2 !== expected) bad.push(l.name);
    }
    expect(bad).toEqual([]);
  });

  itWithCorpus("encodeBlocks is the exact inverse of parseBlocks, every layout, both files", () => {
    // Plan 2's entire write path rests on this property, so it is checked over
    // the whole corpus rather than a sample: 1,020 map.bin plus 1,020 border.bin,
    // 869,988 blocks -- 869,969 by declared geometry plus the 19 trailing
    // blocks the test above pins, so the total is derivable from the tree
    // rather than copied out of a previous run.
    // An earlier draft took `layouts.slice(0, 50)` and skipped
    // border.bin altogether -- the borders being exactly the data Porymap is
    // documented to have destroyed on this tree.
    const { layouts } = JSON.parse(readFileSync(`${G}/data/layouts/layouts.json`, "utf8")) as { layouts: any[] };
    const failures: string[] = [];
    let blocks = 0;

    for (const l of layouts) {
      for (const [kind, file] of [["map", l.blockdata_filepath], ["border", l.border_filepath]] as const) {
        const orig = readFileSync(`${G}/${file}`);
        const parsed = parseBlocks(orig, PROFILE);
        blocks += parsed.length;
        if (!encodeBlocks(parsed, PROFILE).equals(orig)) failures.push(`${l.name} ${kind}`);
      }
    }

    expect(failures).toEqual([]);
    expect(blocks).toBe(869988);
  }, 300_000);

  it("encodeBlocks refuses a field too wide for its mask", () => {
    // Silent truncation is the hazard here, and it is invisible to any
    // round-trip over real data because real data is always in range. Measured:
    // collision 4 encodes to 0 and collision 7 to 3, so a paint tool writing an
    // out-of-range value would quietly store a different, legal one.
    const bad = [{ metatileId: 0, collision: 4, elevation: 0 }];
    expect(() => encodeBlocks(bad, PROFILE)).toThrow(/collision/i);
    expect(() => encodeBlocks([{ metatileId: 0x400, collision: 0, elevation: 0 }], PROFILE))
      .toThrow(/metatileId/i);
    expect(() => encodeBlocks([{ metatileId: 0, collision: 0, elevation: 16 }], PROFILE))
      .toThrow(/elevation/i);
    // The widest legal value of each field still encodes.
    expect(() => encodeBlocks([{ metatileId: 0x3ff, collision: 3, elevation: 15 }], PROFILE)).not.toThrow();
  });
});
