import { describe, it, expect } from "vitest";
import { loadTileset } from "../../src/load/tilesetData.js";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { defaultProfile } from "../../src/config/engine.js";
import { readFileSync } from "node:fs";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const PATHS = parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  // Both sources. gTileset_General declares its palettes in src/graphics.c,
  // and omitting it leaves 242 layouts with an empty palette array.
  [readFileSync(P.tilesetGraphicsH, "utf8"), readFileSync(P.tilesetGraphicsC, "utf8")],
);
const PROFILE = defaultProfile("pokeemerald");

describe("loadTileset", () => {
  itWithCorpus("loads gTileset_General with its real metatile count", () => {
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    expect(t.metatileCount).toBe(512);
    expect(t.attributes).toHaveLength(512);
    expect(t.tiles.width).toBe(128);
    expect(t.palettes.length).toBe(16);
    expect(t.palettes[0]).toHaveLength(16);
  });

  itWithCorpus("loads a secondary tileset", () => {
    const t = loadTileset(P, PATHS.get("gTileset_Petalburg")!, PROFILE);
    expect(t.metatileCount).toBe(144);
  });

  itWithCorpus("decodes a metatile's eight tile entries", () => {
    // `tile <= 0x3ff` and `palette <= 15` cannot fail -- both fields are masked
    // to those widths on the way out, so they hold for any input including
    // garbage. Measured values instead. Raw u16s here are
    // [0x2002, 0x2003, 0x2003, 0x2002, 0, 0, 0, 0].
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    const entries = t.metatile(1);
    expect(entries).toHaveLength(8);
    expect(entries.map((e) => e.tile)).toEqual([2, 3, 3, 2, 0, 0, 0, 0]);
    expect(entries.map((e) => e.palette)).toEqual([2, 2, 2, 2, 0, 0, 0, 0]);
    expect(entries.every((e) => !e.xFlip && !e.yFlip)).toBe(true);
  });

  itWithCorpus("decodes a secondary tileset's entries, which index past the split", () => {
    // Petalburg's metatile 1 draws its bottom layer from primary tiles 2 and 3
    // and its top from 592-609, which are secondary once the 512 boundary is
    // applied. A decoder that dropped the high bits would report tiny numbers.
    const t = loadTileset(P, PATHS.get("gTileset_Petalburg")!, PROFILE);
    const entries = t.metatile(1);
    expect(entries.map((e) => e.tile)).toEqual([2, 3, 3, 2, 592, 593, 608, 609]);
    expect(entries.map((e) => e.palette)).toEqual([2, 2, 2, 2, 5, 5, 5, 5]);
  });

  itWithCorpus("decodes the flip bits, which real tilesets do use", () => {
    // 293 of gTileset_General's 4,096 tile entries set xFlip and 110 set yFlip.
    // Without this nothing distinguishes a decoder that ignores bits 10 and 11.
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    let x = 0, y = 0;
    for (let id = 0; id < t.metatileCount; id++) {
      for (const e of t.metatile(id)) { if (e.xFlip) x++; if (e.yFlip) y++; }
    }
    expect(x).toBe(293);
    expect(y).toBe(110);
  });

  itWithCorpus("pads a short palette to 16 so no colour index is undefined", () => {
    // gTileset_Barn's palette 9 declares 10 colours and gTileset_CianwoodCity's
    // declares 15, yet 12 and 126 metatile entries respectively select index 9.
    // Unpadded, drawTile gets `undefined` for the missing indices and skips the
    // pixel -- holes in the map rather than a visible error.
    const barn = loadTileset(P, PATHS.get("gTileset_Barn")!, PROFILE);
    expect(barn.palettes[9]).toHaveLength(16);
    const cianwood = loadTileset(P, PATHS.get("gTileset_CianwoodCity")!, PROFILE);
    expect(cianwood.palettes[9]).toHaveLength(16);
    expect(barn.palettes.every((p) => p.length === 16)).toBe(true);
  });

  itWithCorpus("exposes layer type and behaviour from attributes", () => {
    // `>= 0 && <= 15` cannot fail: layerType is masked to 0xF000 and shifted,
    // so it is in that range for any input. Measured distribution instead --
    // gTileset_General's 512 metatiles are 218 type 0, 283 type 1, 11 type 2.
    const t = loadTileset(P, PATHS.get("gTileset_General")!, PROFILE);
    expect([0, 1, 2, 3, 4, 5].map((i) => t.layerType(i))).toEqual([0, 0, 1, 0, 1, 0]);

    const hist = new Map<number, number>();
    for (let id = 0; id < t.metatileCount; id++) {
      hist.set(t.layerType(id), (hist.get(t.layerType(id)) ?? 0) + 1);
    }
    expect([...hist.entries()].sort((a, b) => a[0] - b[0])).toEqual([[0, 218], [1, 283], [2, 11]]);

    // Behaviour comes from the low byte of the same u16, so a wrong mask or
    // shift would move both together -- pin it too.
    expect([0, 1, 2, 3, 4, 5].map((i) => t.behavior(i))).toEqual([0, 7, 7, 0, 7, 0]);
  });
});
