import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { BlockEditRefusal } from "../../src/blockEdit/types.js";
import {
  patchGbaMetatile,
  patchGbaAttribute,
  assertNotTripleLayer,
} from "../../src/blockEdit/gbaPatch.js";
import { TileEntry } from "../../src/load/tilesetData.js";
import { defaultProfile, engineProfile, maskShift, type EngineProfile } from "../../src/config/engine.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const METATILES_PATH = "data/tilesets/test_metatiles.bin";
const ATTRIBUTES_PATH = "data/tilesets/test_metatile_attributes.bin";

/** Runs `fn` and returns the refusal it threw; fails the test when it returns. */
function refusal(fn: () => unknown): BlockEditRefusal {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BlockEditRefusal);
    return e as BlockEditRefusal;
  }
  throw new Error("test fixture: expected a BlockEditRefusal, but the call returned");
}

function makeEntry(overrides: Partial<TileEntry> = {}): TileEntry {
  return {
    tile: 0x123,
    xFlip: false,
    yFlip: false,
    palette: 0,
    ...overrides,
  };
}

describe("patchGbaMetatile", () => {
  it("changes only 16 bytes (8 entries * 2 bytes) at the target index", () => {
    const buf = Buffer.alloc(3 * 16, 0xaa); // 3 metatiles, 16 bytes each
    const entries: readonly TileEntry[] = Array.from({ length: 8 }, (_, i) => makeEntry({ tile: 0x100 + i }));
    const patched = patchGbaMetatile(buf, 1, entries, METATILES_PATH);

    expect(patched.length).toBe(buf.length);
    expect(patched.subarray(0, 16)).toEqual(buf.subarray(0, 16)); // metatile 0 unchanged
    expect(patched.subarray(32)).toEqual(buf.subarray(32)); // metatile 2 unchanged

    // Verify metatile 1 was written correctly (16 bytes = 8 u16)
    for (let i = 0; i < 8; i++) {
      const expected = (entries[i]!.tile & 0x3ff)
        | (entries[i]!.xFlip ? 0x400 : 0)
        | (entries[i]!.yFlip ? 0x800 : 0)
        | ((entries[i]!.palette & 0x0f) << 12);
      expect(patched.readUInt16LE(16 + i * 2)).toBe(expected);
    }

    // Input never mutated
    expect(buf.subarray(16, 32)).toEqual(Buffer.alloc(16, 0xaa));
  });

  it("appends a metatile at id === count", () => {
    const buf = Buffer.alloc(2 * 16, 0x55); // 2 metatiles
    const entries: readonly TileEntry[] = Array.from({ length: 8 }, (_, i) => makeEntry({ tile: 0x200 + i }));
    const patched = patchGbaMetatile(buf, 2, entries, METATILES_PATH);

    expect(patched.length).toBe(3 * 16);
    expect(patched.subarray(0, 32)).toEqual(buf);

    for (let i = 0; i < 8; i++) {
      const expected = (entries[i]!.tile & 0x3ff)
        | (entries[i]!.xFlip ? 0x400 : 0)
        | (entries[i]!.yFlip ? 0x800 : 0)
        | ((entries[i]!.palette & 0x0f) << 12);
      expect(patched.readUInt16LE(32 + i * 2)).toBe(expected);
    }
  });

  it("refuses BAD_VALUE for id > count, negative id, and non-integer id", () => {
    const buf = Buffer.alloc(2 * 16, 0x11);
    const entries = Array.from({ length: 8 }, () => makeEntry());

    const beyond = refusal(() => patchGbaMetatile(buf, 3, entries, METATILES_PATH));
    expect(beyond.code).toBe("BAD_VALUE");
    expect(beyond.message.startsWith(METATILES_PATH)).toBe(true);

    const negative = refusal(() => patchGbaMetatile(buf, -1, entries, METATILES_PATH));
    expect(negative.code).toBe("BAD_VALUE");

    const nonInt = refusal(() => patchGbaMetatile(buf, 1.5, entries, METATILES_PATH));
    expect(nonInt.code).toBe("BAD_VALUE");
  });

  it("refuses BAD_VALUE when entries length is not 8", () => {
    const buf = Buffer.alloc(16, 0);
    const badEntries = Array.from({ length: 7 }, () => makeEntry());
    const bad = refusal(() => patchGbaMetatile(buf, 0, badEntries, METATILES_PATH));
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(METATILES_PATH)).toBe(true);
  });

  it("refuses BAD_VALUE when tile exceeds 10 bits, or palette exceeds 4 bits", () => {
    const buf = Buffer.alloc(16, 0);
    const entries = Array.from({ length: 8 }, () => makeEntry());

    const badTile = refusal(() =>
      patchGbaMetatile(buf, 0, [...entries.slice(0, 1), makeEntry({ tile: 0x400 }), ...entries.slice(2)], METATILES_PATH)
    );
    expect(badTile.code).toBe("BAD_VALUE");

    const badPalette = refusal(() =>
      patchGbaMetatile(buf, 0, [...entries.slice(0, 1), makeEntry({ palette: 0x10 }), ...entries.slice(2)], METATILES_PATH)
    );
    expect(badPalette.code).toBe("BAD_VALUE");
  });
});

describe("patchGbaAttribute", () => {
  const profile2 = defaultProfile("pokeemerald"); // 2-byte attributes, behavior=0xff (bits 0-7), layerType=0xf000 (bits 12-15)
  const profile4 = defaultProfile("pokefirered"); // 4-byte attributes
  profile4.metatileAttributesSize = 4;

  it("keeps other bits when editing behavior (width 2)", () => {
    const buf = Buffer.from([0xff, 0xff, 0xaa, 0xaa]); // 2 metatiles, all bits set (0xffff each)
    const patched = patchGbaAttribute(buf, 1, profile2, { behavior: 0x12 }, ATTRIBUTES_PATH);

    expect(patched.length).toBe(4);
    expect(patched.readUInt16LE(0)).toBe(0xffff); // metatile 0 unchanged
    // behavior mask for emerald is 0xff (low 8 bits), layer type in bits 12-15 (mask 0xf000)
    expect(patched.readUInt16LE(2) & 0xff).toBe(0x12); // behavior changed
    expect(patched.readUInt16LE(2) & 0xff00).toBe(0xaa00); // other bits preserved (original had 0xaaaa)
  });

  it("keeps other bits when editing layerType (width 2)", () => {
    const buf = Buffer.from([0xff, 0xff, 0xaa, 0xaa]);
    const patched = patchGbaAttribute(buf, 1, profile2, { layerType: 0x3 }, ATTRIBUTES_PATH);

    // layerType in bits 12-15: 0x3 << 12 = 0x3000
    expect(patched.readUInt16LE(2) & 0xf000).toBe(0x3000);
    // behavior (bits 0-7) and bits 8-11 preserved: 0xaaaa & 0x0fff = 0x0aaa
    expect(patched.readUInt16LE(2) & 0x0fff).toBe(0x0aaa);
  });

  it("keeps other bits when editing both fields (width 2)", () => {
    const buf = Buffer.from([0xff, 0xff, 0x12, 0x34]); // metatile 1 = 0x3412
    const patched = patchGbaAttribute(buf, 1, profile2, { behavior: 0x56, layerType: 0x7 }, ATTRIBUTES_PATH);

    expect(patched.readUInt16LE(2) & 0xff).toBe(0x56);
    expect(patched.readUInt16LE(2) & 0xf000).toBe(0x7000);
    expect(patched.readUInt16LE(2) & 0x0f00).toBe(0x0400); // bits 8-11 preserved from original 0x3412
  });

  it("keeps other bits when editing behavior (width 4)", () => {
    const buf = Buffer.alloc(8, 0xff); // 2 metatiles, 4 bytes each, all bits set (0xffffffff each)
    const patched = patchGbaAttribute(buf, 1, profile4, { behavior: 0x123 }, ATTRIBUTES_PATH);

    expect(patched.readUInt32LE(0)).toBe(0xffffffff);
    // FRLG behavior mask is 0x1ff (9 bits)
    expect(patched.readUInt32LE(4) & 0x1ff).toBe(0x123);
    // Other bits preserved: use >>> 0 to compare as unsigned
    expect((patched.readUInt32LE(4) & 0xfffffe00) >>> 0).toBe(0xfffffe00);
  });

  it("keeps other bits when editing layerType (width 4)", () => {
    const buf = Buffer.alloc(8, 0xff);
    const patched = patchGbaAttribute(buf, 1, profile4, { layerType: 0x2 }, ATTRIBUTES_PATH);

    // FRLG layerType mask is 0x60000000 (bits 29-30)
    // layerType 2 = 0b10, shifted by 29 = 0x40000000
    expect((patched.readUInt32LE(4) & 0x60000000) >>> 0).toBe(0x40000000);
    expect((patched.readUInt32LE(4) & 0x9fffffff) >>> 0).toBe(0x9fffffff); // other bits preserved
  });

  it("refuses BAD_VALUE when behavior exceeds its mask", () => {
    const buf = Buffer.alloc(4, 0);
    const bad = refusal(() => patchGbaAttribute(buf, 0, profile2, { behavior: 0x100 }, ATTRIBUTES_PATH)); // 9 bits for 8-bit mask
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(ATTRIBUTES_PATH)).toBe(true);
  });

  it("refuses BAD_VALUE when layerType exceeds its mask", () => {
    const buf = Buffer.alloc(4, 0);
    const bad = refusal(() => patchGbaAttribute(buf, 0, profile2, { layerType: 0x10 }, ATTRIBUTES_PATH)); // 5 bits for 4-bit mask
    expect(bad.code).toBe("BAD_VALUE");
    expect(bad.message.startsWith(ATTRIBUTES_PATH)).toBe(true);
  });

  it("refuses BAD_VALUE for width 4 when behavior exceeds 9-bit mask", () => {
    const buf = Buffer.alloc(8, 0);
    const bad = refusal(() => patchGbaAttribute(buf, 0, profile4, { behavior: 0x200 }, ATTRIBUTES_PATH)); // 10 bits for 9-bit mask
    expect(bad.code).toBe("BAD_VALUE");
  });

  it("refuses BAD_VALUE for width 4 when layerType exceeds 2-bit mask", () => {
    const buf = Buffer.alloc(8, 0);
    const bad = refusal(() => patchGbaAttribute(buf, 0, profile4, { layerType: 0x4 }, ATTRIBUTES_PATH)); // 3 bits for 2-bit mask
    expect(bad.code).toBe("BAD_VALUE");
  });

  it("appends clones the source word then applies fields", () => {
    const buf = Buffer.from([0x12, 0x34, 0x56, 0x78]); // 2 metatiles, 2 bytes each (0x3412, 0x7856)
    // Append at index 2 (count=2), clone from index 0 (0x3412), then apply behavior=0xab
    const patched = patchGbaAttribute(buf, 2, profile2, { behavior: 0xab }, ATTRIBUTES_PATH, 0);

    expect(patched.length).toBe(6);
    expect(patched.readUInt16LE(0)).toBe(0x3412);
    expect(patched.readUInt16LE(2)).toBe(0x7856);
    // Cloned from index 0 (0x3412), then behavior (low 8 bits) set to 0xab
    expect(patched.readUInt16LE(4) & 0xff).toBe(0xab);
    expect(patched.readUInt16LE(4) & 0xff00).toBe(0x3400); // layer type and other bits from clone

    const fromOne = patchGbaAttribute(buf, 2, profile2, { behavior: 0xab }, ATTRIBUTES_PATH, 1);
    expect(fromOne.readUInt16LE(4)).toBe(0x78ab); // cloned from word 1 (0x7856), behavior applied
  });

  it("appends with cloneFrom defaulting to 0 when omitted", () => {
    const buf = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const patched = patchGbaAttribute(buf, 2, profile2, { behavior: 0xab }, ATTRIBUTES_PATH);

    expect(patched.length).toBe(6);
    expect(patched.readUInt16LE(4) & 0xff).toBe(0xab);
    expect(patched.readUInt16LE(4) & 0xff00).toBe(0x3400);
  });

  it("refuses BAD_VALUE for id > count (not just >= count)", () => {
    const buf = Buffer.alloc(4, 0); // count = 2
    const bad = refusal(() => patchGbaAttribute(buf, 3, profile2, { behavior: 0x12 }, ATTRIBUTES_PATH));
    expect(bad.code).toBe("BAD_VALUE");
  });

  it("refuses BAD_VALUE for negative id", () => {
    const buf = Buffer.alloc(4, 0);
    const bad = refusal(() => patchGbaAttribute(buf, -1, profile2, { behavior: 0x12 }, ATTRIBUTES_PATH));
    expect(bad.code).toBe("BAD_VALUE");
  });

  it("refuses BAD_VALUE when cloneFrom >= count", () => {
    const buf = Buffer.alloc(4, 0); // count = 2
    const bad = refusal(() => patchGbaAttribute(buf, 2, profile2, { behavior: 0x12 }, ATTRIBUTES_PATH, 2));
    expect(bad.code).toBe("BAD_VALUE");
  });
});

describe("assertNotTripleLayer", () => {
  it("throws TRIPLE_LAYER when profile.tripleLayerMetatiles is true", () => {
    const profile = { ...defaultProfile("pokeemerald"), tripleLayerMetatiles: true };
    const bad = refusal(() => assertNotTripleLayer(profile, "porymap.project.cfg"));
    expect(bad.code).toBe("TRIPLE_LAYER");
    expect(bad.message.startsWith("porymap.project.cfg")).toBe(true);
  });

  it("does not throw when profile.tripleLayerMetatiles is false", () => {
    const profile = defaultProfile("pokeemerald");
    expect(() => assertNotTripleLayer(profile, "porymap.project.cfg")).not.toThrow();
  });

  it("throws TRIPLE_LAYER when cfg enables triple layer", () => {
    const cfg = engineProfile({ base_game_version: "pokeemerald", enable_triple_layer_metatiles: "1" });
    const bad = refusal(() => assertNotTripleLayer(cfg, "porymap.project.cfg"));
    expect(bad.code).toBe("TRIPLE_LAYER");
  });
});

describe("patchGbaAttribute with a shifted behavior mask", () => {
  it("places behavior at the mask's low bit and keeps other bits", () => {
    const profile: EngineProfile = { ...defaultProfile("pokeemerald"), metatileBehaviorMask: 0x0ff0, metatileLayerTypeMask: 0xf000 };
    const patched = patchGbaAttribute(Buffer.from([0xff, 0xff]), 0, profile, { behavior: 0x12 }, ATTRIBUTES_PATH);
    expect(patched.readUInt16LE(0)).toBe(0xf12f);
    expect(refusal(() => patchGbaAttribute(Buffer.alloc(2), 0, profile, { behavior: 0x100 }, ATTRIBUTES_PATH)).code).toBe("BAD_VALUE");
  });
});

// ---------------------------------------------------------------------------
// Corpus: every real GBA tileset file round-trips through its own values.
// ---------------------------------------------------------------------------

function tilesetFiles(name: string): string[] {
  const root = join(SUBJECT_ROOT, "data/tilesets");
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => basename(f) === name)
    .map((f) => join(root, f));
}

describe("no-op over every GBA tileset", () => {
  itWithCorpus("metatiles.bin: every entry rewritten from its own values equals the original", () => {
    const files = tilesetFiles("metatiles.bin");
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const file of files) {
      const buf = readFileSync(file);
      for (let id = 0; id < buf.length / 16; id++) {
        const entries: TileEntry[] = Array.from({ length: 8 }, (_, i) => {
          const e = buf.readUInt16LE(id * 16 + i * 2);
          return { tile: e & 0x3ff, xFlip: (e & 0x400) !== 0, yFlip: (e & 0x800) !== 0, palette: e >> 12 };
        });
        if (!patchGbaMetatile(buf, id, entries, relative(SUBJECT_ROOT, file)).equals(buf)) failures.push(`${file}:${id}`);
      }
    }
    expect(failures).toEqual([]);
  });

  itWithCorpus("metatile_attributes.bin: every word rewritten from its own fields equals the original", () => {
    const profile = openProject(SUBJECT_ROOT).profile;
    const size = profile.metatileAttributesSize;
    const files = tilesetFiles("metatile_attributes.bin");
    expect(files.length).toBeGreaterThan(0);
    const field = (word: number, mask: number) => ((word & mask) >>> 0) >>> maskShift(mask);
    const failures: string[] = [];
    for (const file of files) {
      const buf = readFileSync(file);
      expect(buf.length % size, file).toBe(0);
      for (let id = 0; id < buf.length / size; id++) {
        const word = size === 2 ? buf.readUInt16LE(id * 2) : buf.readUInt32LE(id * 4);
        const fields = { behavior: field(word, profile.metatileBehaviorMask), layerType: field(word, profile.metatileLayerTypeMask) };
        if (!patchGbaAttribute(buf, id, profile, fields, relative(SUBJECT_ROOT, file)).equals(buf)) failures.push(`${file}:${id}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
