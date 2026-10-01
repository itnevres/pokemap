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
import { loadGbcSpeciesIds } from "./species.js";

/** Species constant (e.g. "NIDORAN_F") -> folder under gfx/pokemon (e.g. "nidoran_f"). */
export function loadGbcPicFolders(root: string): Map<string, string> {
  const r = norm(root);

  const species = [...loadGbcSpeciesIds(r)];

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
    const slot = (id - 1) * 2;
    let label = slots[slot];
    if (label === undefined) throw new Error(`loadGbcPicFolders: ${picFile}: ${name} (id ${id}) has no slot ${slot} (table has ${slots.length})`);
    if (label === null) {
      // Only UNOWN's pics live in a table of their own; any other null slot is a data error.
      if (name !== "UNOWN") throw new Error(`loadGbcPicFolders: ${picFile}: ${name} has a "dbw -1, -1" slot (only UNOWN may)`);
      const unownFile = "data/pokemon/unown_pic_pointers.asm";
      unownLabel ??= /^\s*dba_pic\s+(\w+)/m.exec(readFileSync(`${r}/${unownFile}`, "utf8"))?.[1];
      if (!unownLabel) throw new Error(`loadGbcPicFolders: ${unownFile}: no dba_pic entry (needed for ${name})`);
      label = unownLabel;
    }
    const dir = labelDir.get(label);
    if (!dir) throw new Error(`loadGbcPicFolders: ${picsFile}: no INCBIN line for ${label} (${name})`);
    out.set(name, dir);
  }
  return out;
}

/** Frame 0 (top width x width square) of gfx/pokemon/<dir>/front.png as RGBA; null for an unknown species. */
export function loadGbcFrontSprite(root: string, species: string, folders?: Map<string, string>): Raster | null {
  const dir = (folders ?? loadGbcPicFolders(root)).get(species);
  if (dir === undefined) return null;
  const where = `loadGbcFrontSprite: gfx/pokemon/${dir}/front.png`;
  let img;
  try {
    img = readIndexedPng(readFileSync(`${norm(root)}/gfx/pokemon/${dir}/front.png`));
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }
  if (img.height < img.width) throw new Error(`${where}: ${img.width}x${img.height} is shorter than wide, expected stacked square frames`);
  const w = img.width;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i++) {
    const c = img.palette[img.indices[i]!];
    if (!c) throw new Error(`${where}: pixel ${i} uses palette index ${img.indices[i]}, outside PLTE (${img.palette.length} entries)`);
    data.set([c.r, c.g, c.b, 255], i * 4);
  }
  // ponytail: alpha is always 255 -- every PerfPlus front.png tRNS is all-255
  // (measured) and Unown has none; honour tRNS if a mod ships a transparent index.
  return { width: w, height: w, data };
}
