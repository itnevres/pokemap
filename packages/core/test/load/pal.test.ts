import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parseJascPal } from "../../src/load/pal.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

describe("parseJascPal", () => {
  it("parses a 16-colour JASC palette", () => {
    const pal = parseJascPal("JASC-PAL\r\n0100\r\n16\r\n24 41 82\r\n255 255 255\r\n" + "0 0 0\r\n".repeat(14));
    expect(pal).toHaveLength(16);
    expect(pal[0]).toEqual({ r: 24, g: 41, b: 82 });
    expect(pal[1]).toEqual({ r: 255, g: 255, b: 255 });
  });

  itWithCorpus("parses the subject repo's real palette", () => {
    const pal = parseJascPal(readFileSync(
      `${SUBJECT_ROOT}/data/tilesets/primary/general/palettes/00.pal`, "utf8"));
    expect(pal).toHaveLength(16);
    // Real values. `every(c => c.r <= 255)` would pass against a parser that
    // returned sixteen blacks, which is exactly what the `?? 0` fallback
    // produces on a line it fails to read.
    expect(pal[0]).toEqual({ r: 24, g: 41, b: 82 });
    expect(pal[1]).toEqual({ r: 255, g: 255, b: 255 });
    expect(pal[2]).toEqual({ r: 222, g: 230, b: 238 });
    expect(new Set(pal.map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(15);
  });

  itWithCorpus("reads every .pal in the tree, honouring each declared count", () => {
    // 3,724 files. Almost all declare 16 colours, but one declares 10 and one
    // declares 15 -- so the count is read from the file, never assumed.
    const dir = `${SUBJECT_ROOT}/data/tilesets`;
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".pal") ? [`${d}/${e.name}`] : []);

    const files = walk(dir);
    expect(files.length).toBe(3724);

    const sizes = new Map<number, number>();
    for (const f of files) {
      const pal = parseJascPal(readFileSync(f, "utf8"));
      sizes.set(pal.length, (sizes.get(pal.length) ?? 0) + 1);
    }
    expect(sizes.get(16)).toBe(3722);
    expect(sizes.get(15)).toBe(1);
    expect(sizes.get(10)).toBe(1);
  }, 120_000);

  it("rejects a file that is not JASC-PAL", () => {
    expect(() => parseJascPal("RIFF...")).toThrow(/JASC-PAL/);
  });

  it("refuses a malformed colour line rather than silently calling it black", () => {
    // `parts[0] ?? 0` would turn "24 41" into {24,41,0} -- a plausible colour
    // that is simply wrong, and indistinguishable from a real dark blue.
    const short = "JASC-PAL\r\n0100\r\n2\r\n24 41\r\n255 255 255\r\n";
    expect(() => parseJascPal(short)).toThrow(/malformed/i);
  });

  it("refuses a file with fewer colour lines than it declares", () => {
    const truncated = "JASC-PAL\r\n0100\r\n4\r\n1 2 3\r\n4 5 6\r\n";
    expect(() => parseJascPal(truncated)).toThrow(/declares 4/);
  });
});
