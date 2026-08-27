import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseTilesetPaths } from "../../src/load/tilesets.js";
import { projectPaths } from "../../src/config/paths.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const P = projectPaths(SUBJECT_ROOT);
const read = () => parseTilesetPaths(
  readFileSync(P.tilesetHeadersH, "utf8"),
  readFileSync(P.tilesetMetatilesH, "utf8"),
  [readFileSync(P.tilesetGraphicsH, "utf8"), readFileSync(P.tilesetGraphicsC, "utf8")],
);

describe("parseTilesetPaths", () => {
  itWithCorpus("resolves gTileset_General to the primary/general directory", () => {
    const t = read().get("gTileset_General")!;
    expect(t.metatilesBin).toBe("data/tilesets/primary/general/metatiles.bin");
    expect(t.attributesBin).toBe("data/tilesets/primary/general/metatile_attributes.bin");
    expect(t.dir).toBe("data/tilesets/primary/general");
    expect(t.isSecondary).toBe(false);
    // Declared in src/graphics.c, not graphics.h. Reading only the header
    // leaves this empty and every map using General renders transparent.
    expect(t.palettes).toHaveLength(16);
    expect(t.palettes[0]).toBe("data/tilesets/primary/general/palettes/00.gbapal");
  });

  itWithCorpus("resolves a secondary tileset and its palette list", () => {
    const t = read().get("gTileset_Petalburg")!;
    expect(t.dir).toBe("data/tilesets/secondary/petalburg");
    expect(t.isSecondary).toBe(true);
    expect(t.palettes).toHaveLength(16);
    expect(t.palettes[0]).toBe("data/tilesets/secondary/petalburg/palettes/00.gbapal");
  });

  itWithCorpus("resolves tilesets no name-mangling scheme could reach", () => {
    // 22 of this tree's 242 tilesets have a directory that cannot be derived
    // from the symbol by any rule. This is the proof of invariant I4: the
    // mapping is DATA, read from INCBIN, not a transformation of the name.
    const t = read();
    // Nothing about "TrainerHill_Courtyard" suggests "battle_tower_outer".
    expect(t.get("gTileset_TrainerHill_Courtyard")!.dir).toBe("data/tilesets/secondary/battle_tower_outer");
    // Directories that drop or rewrite words the symbol carries.
    expect(t.get("gTileset_GoldenrodCity_TrainStation")!.dir).toBe("data/tilesets/secondary/goldenrod_station");
    expect(t.get("gTileset_SaffronCity_FightingDojoVIP")!.dir).toBe("data/tilesets/secondary/saffron_city_dojo_vip");
    expect(t.get("gTileset_SSAnne")!.dir).toBe("data/tilesets/secondary/ss_anne");
    expect(t.get("gTileset_RuinsOfAlph_B1F")!.dir).toBe("data/tilesets/secondary/ruins_of_alph_b1_f");
  });

  itWithCorpus("handles the many-to-one case that makes mangling impossible in principle", () => {
    // NINE symbols share one directory, and six share another. No function
    // from symbol to path can produce that, however the rule is written --
    // which is why the mapping has to be read rather than derived.
    const t = read();
    const byDir = new Map<string, string[]>();
    for (const [symbol, paths] of t) {
      (byDir.get(paths.dir) ?? byDir.set(paths.dir, []).get(paths.dir)!).push(symbol);
    }
    expect(byDir.get("data/tilesets/primary/building")).toHaveLength(9);
    expect(byDir.get("data/tilesets/secondary/secret_base")).toHaveLength(6);
    expect(t.get("gTileset_Building")!.dir).toBe("data/tilesets/primary/building");
    expect(t.get("gTileset_Building_Pyramid")!.dir).toBe("data/tilesets/primary/building");
  });

  itWithCorpus("parses every Tileset struct in headers.h", () => {
    // 242 today. A regex that silently stopped matching some of them would
    // still satisfy the coverage test below, since layouts.json names only a
    // subset -- so pin the total independently.
    expect(read().size).toBe(242);
  });

  itWithCorpus("covers every tileset named by layouts.json", () => {
    const paths = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const missing = new Set<string>();
    for (const l of layouts) {
      for (const k of [l.primary_tileset, l.secondary_tileset]) if (!paths.has(k)) missing.add(k);
    }
    expect([...missing]).toEqual([]);
  });

  itWithCorpus("every tileset layouts.json names resolves a non-empty palette list", () => {
    // The blank-render trap, pinned. An empty palettes array throws nothing --
    // it renders a fully transparent map, which no "does it throw" test catches.
    const t = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const named = new Set(layouts.flatMap((l) => [l.primary_tileset, l.secondary_tileset]));
    const empty = [...named].filter((k) => (t.get(k)?.palettes.length ?? 0) === 0);
    expect(empty).toEqual([]);
  });

  itWithCorpus("resolves tilesPng from .tiles, not from the metatiles directory", () => {
    const t = read();
    expect(t.get("gTileset_Building_Frontier")!.tilesPng)
      .toBe("data/tilesets/primary/building_frontier/tiles.png");
    expect(t.get("gTileset_Building_Frontier")!.dir)
      .toBe("data/tilesets/primary/building");
    // Measured directly against the corpus: .tiles for SecretBaseTree is
    // "secondary/secret_base/tree", not "secondary/tree" -- there is no
    // "secondary/tree" directory in this tree at all.
    expect(t.get("gTileset_SecretBaseTree")!.tilesPng)
      .toBe("data/tilesets/secondary/secret_base/tree/tiles.png");
    expect(t.get("gTileset_FrlgSilphCo")!.tilesPng)
      .toBe("data/tilesets/secondary/condominiums/tiles.png");
    // And the ordinary case still agrees with dir.
    expect(t.get("gTileset_Petalburg")!.tilesPng)
      .toBe("data/tilesets/secondary/petalburg/tiles.png");
  });

  itWithCorpus("every tilesPng a layout depends on actually exists on disk", () => {
    // The guard for this whole class: a path that is merely plausible resolves
    // silently. Only the filesystem settles it.
    const t = read();
    const { layouts } = JSON.parse(readFileSync(P.layoutsJson, "utf8")) as { layouts: any[] };
    const named = new Set(layouts.flatMap((l) => [l.primary_tileset, l.secondary_tileset]));
    const missing = [...named].filter((k) => {
      const png = t.get(k)?.tilesPng;
      return !png || !existsSync(`${SUBJECT_ROOT}/${png}`);
    });
    expect(missing).toEqual([]);
  });
});
