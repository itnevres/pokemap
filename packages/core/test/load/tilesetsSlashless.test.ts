import { describe, it, expect } from "vitest";
import { posix } from "node:path";
import { parseTilesetPaths } from "../../src/load/tilesets.js";

// A `.metatiles` INCBIN with no directory part ("..a" is a legal file name in the
// project root) used to derive tiles.png as "../tiles.png": dirOf() dropped the
// last character instead of the file name. No `.tiles` field means that derived
// path was never checked, so loadTileset read a file outside the project.
const headers = (extra = "") => `
const struct Tileset gTileset_X =
{
    .isCompressed = TRUE,
    .isSecondary = FALSE,
    .palettes = gTilesetPalettes_X,
    .metatiles = gMetatiles_X,
    .metatileAttributes = gMetatileAttributes_X,${extra}
};
`;
const metatiles = (meta: string, attrs: string) => `
const u16 gMetatiles_X[] = INCBIN_U16("${meta}");
const u16 gMetatileAttributes_X[] = INCBIN_U16("${attrs}");
`;
const graphics = `const u16 gTilesetPalettes_X[][16] = { INCBIN_U16("data/x/palettes/00.gbapal") };`;

const parse = (meta: string, attrs = "attrs.bin") =>
  parseTilesetPaths(headers(), metatiles(meta, attrs), graphics).get("gTileset_X")!;

describe("parseTilesetPaths: derived tiles.png stays inside the project", () => {
  it("a slashless .metatiles path puts tiles.png in the project root, not above it", () => {
    for (const meta of ["..a", "metatiles.bin", "x"]) {
      const t = parse(meta);
      expect(t.brokenPaths).toBeUndefined();
      expect(t.tilesPng).toBe("./tiles.png");
      expect(t.dir).toBe(".");
    }
  });

  it("a backslash-separated .metatiles path that folds to a slashless name stays inside", () => {
    const t = parse("a\\..\\..a");
    // normalizes to "..a" (inside); the derived tiles.png must not climb out
    expect(t.brokenPaths).toBeUndefined();
    expect(posix.normalize(t.tilesPng.replace(/\\/g, "/"))).toBe("tiles.png");
  });

  it("a .metatiles path that really leaves the project is still broken", () => {
    expect(parse("../outside.bin").brokenPaths?.[0]?.key).toBe(".metatiles");
    expect(parse("data/../../outside.bin").brokenPaths?.[0]?.key).toBe(".metatiles");
  });

  it("a normal nested path keeps its directory", () => {
    const t = parse("data/tilesets/primary/x/metatiles.bin");
    expect(t.dir).toBe("data/tilesets/primary/x");
    expect(t.tilesPng).toBe("data/tilesets/primary/x/tiles.png");
  });
});
