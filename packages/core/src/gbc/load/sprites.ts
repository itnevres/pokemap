/**
 * GBC (pokecrystal-family) Pokemon front sprites (Plan 6c Task B1).
 *
 * Species constant -> `gfx/pokemon/<dir>/front.png` is a three-hop chain, none
 * of whose files is authoritative alone: `constants/pokemon_constants.asm`
 * gives the species id; `data/pokemon/pic_pointers.asm`'s `PokemonPicPointers`
 * is species-indexed, two slots per species (front, back), each naming a
 * LABEL (`dba_pic HoOhFrontpic`); `gfx/pics.asm` maps each label to its folder
 * on one line (`HoOhFrontpic: INCBIN "gfx/pokemon/ho_oh/front..."`). UNOWN's
 * slot pair is `dbw -1, -1` (its pics live in `UnownPicPointers`), so it takes
 * that table's first entry (`unown_a`); `gfx/pokemon/unown/` has no front.png.
 */
import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { readIndexedPng } from "../../load/png.js";
import type { Raster } from "../../render/raster.js";
import { parseConstDefs } from "./asm.js";

const NON_SPECIES = new Set(["NO_MON", "EGG"]);

/** Species constant (e.g. "NIDORAN_F") -> folder under gfx/pokemon (e.g. "nidoran_f"). */
export function loadGbcPicFolders(root: string): Map<string, string> {
  const r = norm(root);

  // Species ids: the first const_def block, same slicing as loadGbcSpeciesConstants.
  const constFile = "constants/pokemon_constants.asm";
  const constText = readFileSync(`${r}/${constFile}`, "utf8");
  const constDefRe = /^\s*const_def\b.*$/gm;
  constDefRe.exec(constText);
  const second = constDefRe.exec(constText);
  const ids = parseConstDefs(second ? constText.slice(0, second.index) : constText);
  const species = [...ids].filter(([k]) => !NON_SPECIES.has(k));

  // PokemonPicPointers: every slot line between the table label and its length assert.
  const picFile = "data/pokemon/pic_pointers.asm";
  const picLines = readFileSync(`${r}/${picFile}`, "utf8").split(/\r?\n/);
  const start = picLines.findIndex((l) => /^PokemonPicPointers::/.test(l));
  if (start < 0) throw new Error(`loadGbcPicFolders: ${picFile}: no "PokemonPicPointers::" found`);
  const end = picLines.findIndex((l, i) => i > start && /^\s*assert_table_length\s+NUM_POKEMON\b/.test(l));
  if (end < 0) throw new Error(`loadGbcPicFolders: ${picFile}: no "assert_table_length NUM_POKEMON" after PokemonPicPointers`);
  const slots = picLines.slice(start + 1, end).flatMap((l) => {
    const m = /^\s*(?:dba_pic\s+(\w+)|dbw\s+-1,\s*-1)/.exec(l);
    return m ? [m[1] ?? null] : [];
  });
  if (slots.length !== species.length * 2) {
    throw new Error(`loadGbcPicFolders: ${picFile}: ${slots.length} PokemonPicPointers slots, expected 2 x ${species.length} species`);
  }

  // Label -> folder, one `Label: INCBIN "gfx/pokemon/<dir>/..."` line each.
  const picsFile = "gfx/pics.asm";
  const labelDir = new Map<string, string>();
  for (const l of readFileSync(`${r}/${picsFile}`, "utf8").split(/\r?\n/)) {
    const m = /^(\w+):\s*INCBIN\s+"gfx\/pokemon\/([^/"]+)\//.exec(l);
    if (m) labelDir.set(m[1]!, m[2]!);
  }

  let unownLabel: string | undefined;
  const out = new Map<string, string>();
  for (const [name, id] of species) {
    let label = slots[(id - 1) * 2];
    if (label === null) {
      const unownFile = "data/pokemon/unown_pic_pointers.asm";
      unownLabel ??= /^\s*dba_pic\s+(\w+)/m.exec(readFileSync(`${r}/${unownFile}`, "utf8"))?.[1];
      if (!unownLabel) throw new Error(`loadGbcPicFolders: ${unownFile}: no dba_pic entry (needed for ${name})`);
      label = unownLabel;
    }
    const dir = labelDir.get(label!);
    if (!dir) throw new Error(`loadGbcPicFolders: ${picsFile}: no INCBIN line for ${label} (${name})`);
    out.set(name, dir);
  }
  return out;
}

/** Frame 0 (top width x width square) of gfx/pokemon/<dir>/front.png as RGBA; null for an unknown species. */
export function loadGbcFrontSprite(root: string, species: string, folders?: Map<string, string>): Raster | null {
  const dir = (folders ?? loadGbcPicFolders(root)).get(species);
  if (dir === undefined) return null;
  const img = readIndexedPng(readFileSync(`${norm(root)}/gfx/pokemon/${dir}/front.png`));
  if (img.height < img.width) throw new Error(`loadGbcFrontSprite: gfx/pokemon/${dir}/front.png is ${img.width}x${img.height}, expected stacked square frames`);
  const w = img.width;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i++) {
    const { r, g, b } = img.palette[img.indices[i]!]!;
    data.set([r, g, b, 255], i * 4);
  }
  // ponytail: alpha is always 255 -- every PerfPlus front.png tRNS is all-255
  // (measured) and Unown has none; honour tRNS if a mod ships a transparent index.
  return { width: w, height: w, data };
}
