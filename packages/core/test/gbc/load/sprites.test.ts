import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { loadGbcFrontSprite, loadGbcPicFolders } from "../../../src/gbc/load/sprites.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

const G = GBC_SUBJECT_ROOT;

/** Raw PNG read, independent of `readIndexedPng`: IDAT inflate + PLTE, valid
 *  only for depth-8 indexed images whose every scanline uses filter 0 (true of
 *  DUNSPARCE's front.png, asserted below). */
function rawIndexed(file: string) {
  const buf = readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  let plte = Buffer.alloc(0);
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IDAT") idat.push(data);
    if (type === "PLTE") plte = data;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width + 1;
  for (let y = 0; y < height; y++) expect(raw[y * stride]).toBe(0);
  const px = (x: number, y: number): number[] => {
    const i = raw[y * stride + 1 + x]!;
    return [plte[i * 3]!, plte[i * 3 + 1]!, plte[i * 3 + 2]!, 255];
  };
  return { width, height, px };
}

/** Hand-built depth-8 indexed PNG (colour type 3, filter 0 on every row). */
function indexedPng(width: number, height: number, palette: number[][], indices: number[]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // depth
  ihdr[9] = 3; // indexed
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = indices[y * width + x]!;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from(palette.flat())),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Writes `files` (relative path -> content) into a fresh temp root, runs `fn`, always removes it. */
function withRoot<T>(files: Record<string, string | Buffer>, fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "pokemap-sprites-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const consts = (first: number, ...names: string[]) =>
  `\tconst_def ${first}\n${names.map((n) => `\tconst ${n}\n`).join("")}DEF NUM_POKEMON EQU const_value - 1\n\tconst_skip\n\tconst EGG\n`;
const table = (...slots: string[]) => `PokemonPicPointers::\n${slots.map((s) => `\t${s}\n`).join("")}\tassert_table_length NUM_POKEMON\n`;
const NULL = "dbw -1, -1";
const PICS = [
  'AaaFrontpic: INCBIN "gfx/pokemon/aaa/front.animated.2bpp.lz"',
  'BbbFrontpic: INCBIN "gfx/pokemon/bbb/front.animated.2bpp.lz"',
  'UnownAFrontpic: INCBIN "gfx/pokemon/unown_a/front.animated.2bpp.lz"',
].join("\n");
const CONSTS = "constants/pokemon_constants.asm";
const TABLE = "data/pokemon/pic_pointers.asm";
const PICS_ASM = "gfx/pics.asm";
const UNOWN = "data/pokemon/unown_pic_pointers.asm";
/** Two species AAA (1), BBB (2) with fully valid tables; tests break one thing at a time. */
const base = (): Record<string, string> => ({
  [CONSTS]: consts(1, "AAA", "BBB"),
  [TABLE]: table("dba_pic AaaFrontpic", "dba_pic AaaBackpic", "dba_pic BbbFrontpic", "dba_pic BbbBackpic"),
  [PICS_ASM]: PICS,
});

describe("loadGbcPicFolders", () => {
  itWithGbcCorpus("resolves all 251 species through pic_pointers.asm + pics.asm", () => {
    const f = loadGbcPicFolders(G);
    expect(f.size).toBe(251);
    expect(f.get("CHIKORITA")).toBe("chikorita");
    expect(f.get("NIDORAN_F")).toBe("nidoran_f");
    expect(f.get("MR__MIME")).toBe("mr__mime");
    expect(f.get("HO_OH")).toBe("ho_oh");
    expect(f.get("UNOWN")).toBe("unown_a");
  });

  itWithGbcCorpus("every folder has a front.png; only UNOWN differs from its lowercased key", () => {
    const f = loadGbcPicFolders(G);
    for (const dir of f.values()) expect(existsSync(`${G}/gfx/pokemon/${dir}/front.png`)).toBe(true);
    const differing = [...f].filter(([k, v]) => v !== k.toLowerCase()).map(([k]) => k);
    expect(differing).toEqual(["UNOWN"]);
  });

  it("temp fixture sanity: the unbroken base resolves", () => {
    withRoot(base(), (root) => expect([...loadGbcPicFolders(root)]).toEqual([["AAA", "aaa"], ["BBB", "bbb"]]));
  });

  it("a missing slot throws, naming pic_pointers.asm and both counts", () => {
    const files = { ...base(), [TABLE]: table("dba_pic AaaFrontpic", "dba_pic AaaBackpic", "dba_pic BbbFrontpic") };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`loadGbcPicFolders: ${TABLE}: 3 PokemonPicPointers slots, expected 2 x 2 species`));
  });

  it("a missing PokemonPicPointers:: label throws", () => {
    const files = { ...base(), [TABLE]: "\tdba_pic AaaFrontpic\n\tassert_table_length NUM_POKEMON\n" };
    withRoot(files, (root) => expect(() => loadGbcPicFolders(root)).toThrow(`${TABLE}: no "PokemonPicPointers::" found`));
  });

  it("a missing assert_table_length NUM_POKEMON throws", () => {
    const files = { ...base(), [TABLE]: "PokemonPicPointers::\n\tdba_pic AaaFrontpic\n\tdba_pic AaaBackpic\n" };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`${TABLE}: no "assert_table_length NUM_POKEMON" after PokemonPicPointers`));
  });

  it("a front label with no pics.asm INCBIN line throws, naming label and species", () => {
    const files = { ...base(), [PICS_ASM]: 'AaaFrontpic: INCBIN "gfx/pokemon/aaa/front.animated.2bpp.lz"' };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`${PICS_ASM}: no INCBIN line for BbbFrontpic (BBB)`));
  });

  it("UNOWN takes the first dba_pic of unown_pic_pointers.asm", () => {
    const files = {
      ...base(),
      [CONSTS]: consts(1, "AAA", "UNOWN"),
      [TABLE]: table("dba_pic AaaFrontpic", "dba_pic AaaBackpic", NULL, NULL),
      [UNOWN]: "UnownPicPointers::\n\tdba_pic UnownAFrontpic\n\tdba_pic UnownABackpic\n",
    };
    withRoot(files, (root) => expect(loadGbcPicFolders(root).get("UNOWN")).toBe("unown_a"));
  });

  it("UNOWN with no dba_pic in unown_pic_pointers.asm throws", () => {
    const files = {
      ...base(),
      [CONSTS]: consts(1, "AAA", "UNOWN"),
      [TABLE]: table("dba_pic AaaFrontpic", "dba_pic AaaBackpic", NULL, NULL),
      [UNOWN]: "UnownPicPointers::\n",
    };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`${UNOWN}: no dba_pic entry (needed for UNOWN)`));
  });

  it("a non-UNOWN species with a 'dbw -1, -1' slot throws instead of borrowing Unown's sprite", () => {
    const files = {
      ...base(),
      [TABLE]: table("dba_pic AaaFrontpic", "dba_pic AaaBackpic", NULL, NULL),
      [UNOWN]: "UnownPicPointers::\n\tdba_pic UnownAFrontpic\n",
    };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`${TABLE}: BBB has a "dbw -1, -1" slot (only UNOWN may)`));
  });

  it("an id whose slot is beyond the table throws, naming the slot index", () => {
    // ids 2,3 (const_def 2): slot count 4 = 2 x 2 passes, but BBB (id 3) wants slot 4.
    const files = { ...base(), [CONSTS]: consts(2, "AAA", "BBB") };
    withRoot(files, (root) =>
      expect(() => loadGbcPicFolders(root)).toThrow(`${TABLE}: BBB (id 3) has no slot 4 (table has 4)`));
  });

  it("a constants file with no const_def throws (shared species-id helper)", () => {
    const files = { ...base(), [CONSTS]: "; nothing here\n" };
    withRoot(files, (root) => expect(() => loadGbcPicFolders(root)).toThrow(`${CONSTS}: no "const_def" line found`));
  });
});

describe("loadGbcFrontSprite", () => {
  itWithGbcCorpus("DUNSPARCE: frame 0 of the 48x288 sheet, pixels match the raw PNG", () => {
    const png = rawIndexed(`${G}/gfx/pokemon/dunsparce/front.png`);
    expect([png.width, png.height]).toEqual([48, 288]);
    const r = loadGbcFrontSprite(G, "DUNSPARCE")!;
    expect([r.width, r.height]).toEqual([48, 48]);
    expect(r.data.length).toBe(48 * 48 * 4);
    const at = (x: number, y: number) => [...r.data.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4)];
    // Literal pins (index -> PLTE colour) from the measured file...
    expect(at(24, 1)).toEqual([0, 0, 0, 255]);
    expect(at(27, 1)).toEqual([66, 123, 189, 255]);
    expect(at(25, 2)).toEqual([255, 198, 49, 255]);
    expect(at(10, 24)).toEqual([255, 255, 255, 255]);
    // ...frame 1 differs at (10,24), so a wrong crop fails this pin.
    expect(png.px(10, 72)).toEqual([66, 123, 189, 255]);
    // ...and every pin agrees with the independent raw read.
    for (const [x, y] of [[24, 1], [27, 1], [25, 2], [10, 24]] as const) expect(at(x, y)).toEqual(png.px(x, y));
    // Whole frame 0 against the raw read.
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) expect(at(x, y)).toEqual(png.px(x, y));
  });

  itWithGbcCorpus("an unknown species is null", () => {
    expect(loadGbcFrontSprite(G, "NOT_A_MON")).toBeNull();
  });

  const FRONT = "gfx/pokemon/aaa/front.png";
  const folders = new Map([["AAA", "aaa"]]);
  const WHERE = `loadGbcFrontSprite: ${FRONT}`;
  const PAL = [[255, 255, 255], [0, 0, 0]];

  it("temp fixture sanity: a 2x4 stacked sheet crops to its top 2x2 frame", () => {
    const png = indexedPng(2, 4, PAL, [0, 1, 1, 0, 1, 1, 1, 1]);
    withRoot({ [FRONT]: png }, (root) => {
      const r = loadGbcFrontSprite(root, "AAA", folders)!;
      expect([r.width, r.height]).toEqual([2, 2]);
      expect([...r.data]).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    });
  });

  it("a sheet shorter than wide (2x1) throws, naming the file and size", () => {
    withRoot({ [FRONT]: indexedPng(2, 1, PAL, [0, 1]) }, (root) =>
      expect(() => loadGbcFrontSprite(root, "AAA", folders)).toThrow(`${WHERE}: 2x1 is shorter than wide, expected stacked square frames`));
  });

  it("a pixel index outside PLTE throws a named error, not a destructuring TypeError", () => {
    withRoot({ [FRONT]: indexedPng(1, 1, [[255, 255, 255]], [5]) }, (root) =>
      expect(() => loadGbcFrontSprite(root, "AAA", folders)).toThrow(`${WHERE}: pixel 0 uses palette index 5, outside PLTE (1 entries)`));
  });

  it("a decode failure is rethrown with the file named", () => {
    withRoot({ [FRONT]: Buffer.from("not a png at all, just bytes") }, (root) =>
      expect(() => loadGbcFrontSprite(root, "AAA", folders)).toThrow(`${WHERE}: not a PNG`));
  });
});
