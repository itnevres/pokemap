export interface TilesetPaths {
  symbol: string;
  /** The directory of `.metatiles` and `.metatileAttributes` ONLY. The art and
   *  palettes can live elsewhere, so never build another path from this. */
  dir: string;
  isSecondary: boolean;
  metatilesBin: string;
  attributesBin: string;
  /** Resolved from the `.tiles` field's own INCBIN path, which is NOT always in
   *  `dir` -- 15 tilesets differ. The INCBIN names `tiles.4bpp.lz`, a gitignored
   *  build artifact (I3); its directory is right, the filename is not. */
  tilesPng: string;
  /** .gbapal paths as INCBINed; the .pal sibling is the committed source (I3). */
  palettes: string[];
}

/**
 * `const u16 gMetatiles_General[] = INCBIN_U16("data/.../metatiles.bin");`
 * or, for palettes, `const u16 ALIGNED(4) gTilesetPalettes_Foo[][16] = { INCBIN_U16(...), ... };`
 *
 * The run between `const` and the symbol is not just a type name: real
 * declarations interpose alignment qualifiers like `ALIGNED(4)`, which contain
 * parentheses and a digit. The tolerated-character class below has to include
 * `()` or every ALIGNED-qualified palette array in graphics.h -- roughly 150
 * of them -- silently fails to match and vanishes from the map.
 *
 * The lazy `[\s\S]*?;` terminator is comment-blind: it stops at the first `;`
 * it finds, including one inside an inline `//` comment written before the
 * real closing brace. That would yield a truncated, partial INCBIN list
 * rather than a missing one, which the non-empty-palette guard would not
 * catch either. Not present in this corpus today -- headers.h already has
 * commented-out fields in that style, so the next file to grow one could.
 */
function incbinMap(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /const\s+[\w\s*()]+?\b(g\w+)\s*(?:\[\s*\]|\[\s*\]\s*\[\s*\d+\s*\])\s*=\s*([\s\S]*?);/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const paths = [...m[2]!.matchAll(/INCBIN_\w+\(\s*"([^"]+)"\s*\)/g)].map((p) => p[1]!);
    if (paths.length) out.set(m[1]!, paths);
  }
  return out;
}

/**
 * Bind gTileset_X to its data symbols through headers.h — the authoritative
 * link — then resolve those symbols to paths through metatiles.h and one or
 * more graphics sources. Directory names are never derived from symbol
 * names (I4).
 *
 * `graphicsSources` accepts more than one file because not every tileset's
 * palettes are declared in graphics.h: `gTileset_General` and its two
 * Frontier siblings INCBIN theirs from `src/graphics.c` instead. Reading
 * only graphics.h leaves those three resolving an empty `palettes` array --
 * which throws nothing, since an empty array is a valid value, and instead
 * renders every map that uses them fully transparent (242 of 1,020 layouts
 * measured against the subject repo).
 */
export function parseTilesetPaths(
  headersH: string,
  metatilesH: string,
  graphicsSources: string | string[],
): Map<string, TilesetPaths> {
  const graphics = Array.isArray(graphicsSources) ? graphicsSources : [graphicsSources];
  const data = new Map([
    ...incbinMap(metatilesH),
    ...graphics.flatMap((g) => [...incbinMap(g)]),
  ]);
  const out = new Map<string, TilesetPaths>();

  const structRe = /const\s+struct\s+Tileset\s+(g\w+)\s*=\s*\{([\s\S]*?)\n\};/g;
  for (let m = structRe.exec(headersH); m; m = structRe.exec(headersH)) {
    const [symbol, body] = [m[1]!, m[2]!];
    const field = (name: string) => new RegExp(`\\.${name}\\s*=\\s*(\\w+)`).exec(body)?.[1];

    const metatilesBin = data.get(field("metatiles") ?? "")?.[0];
    const attributesBin = data.get(field("metatileAttributes") ?? "")?.[0];
    const tilesBin = data.get(field("tiles") ?? "")?.[0];
    const palettes = data.get(field("palettes") ?? "") ?? [];
    if (!metatilesBin || !attributesBin) continue;

    const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
    const dir = dirOf(metatilesBin);
    out.set(symbol, {
      symbol, dir,
      isSecondary: /\.isSecondary\s*=\s*TRUE/.test(body),
      metatilesBin, attributesBin,
      // From `.tiles`, not from `dir`. They differ for 15 tilesets, and eight
      // of those have a tiles.png at the wrong path too, so getting this wrong
      // renders another tileset's art with no error at all.
      tilesPng: `${tilesBin ? dirOf(tilesBin) : dir}/tiles.png`,
      palettes,
    });
  }
  return out;
}
