import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
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

  it("throws, naming pic_pointers.asm, when a slot is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sprites-"));
    mkdirSync(join(root, "constants"));
    mkdirSync(join(root, "data/pokemon"), { recursive: true });
    mkdirSync(join(root, "gfx"));
    writeFileSync(join(root, "constants/pokemon_constants.asm"),
      "\tconst_def 1\n\tconst AAA\n\tconst BBB\nDEF NUM_POKEMON EQU const_value - 1\n\tconst_skip\n\tconst EGG\n");
    writeFileSync(join(root, "data/pokemon/pic_pointers.asm"),
      "PokemonPicPointers::\n\tdba_pic AaaFrontpic\n\tdba_pic AaaBackpic\n\tdba_pic BbbFrontpic\n\tassert_table_length NUM_POKEMON\n");
    writeFileSync(join(root, "gfx/pics.asm"),
      'AaaFrontpic: INCBIN "gfx/pokemon/aaa/front.animated.2bpp.lz"\nBbbFrontpic: INCBIN "gfx/pokemon/bbb/front.animated.2bpp.lz"\n');
    expect(() => loadGbcPicFolders(root)).toThrow(/pic_pointers\.asm/);
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
});
