import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { parseConstDefs } from "./asm.js";

const NON_SPECIES = new Set(["NO_MON", "EGG"]);

/**
 * Species constant -> species id (BULBASAUR 1 .. CELEBI 251) from the FIRST
 * `const_def` block of `constants/pokemon_constants.asm`, excluding `EGG` and,
 * defensively, `NO_MON`. The file's SECOND `const_def` block is the unrelated
 * `UNOWN_A`..`UNOWN_Z` letter-form enum, so the text is sliced at the second
 * `const_def` line (found by regex, never a line number) before
 * `parseConstDefs`. Shared by `loadGbcSpeciesConstants` (atlas.ts, which only
 * wants the names) and `loadGbcPicFolders` (sprites.ts, which needs the ids).
 * Throws, naming the file, when it has no `const_def` line at all.
 */
export function loadGbcSpeciesIds(root: string): Map<string, number> {
  const file = "constants/pokemon_constants.asm";
  const text = readFileSync(`${norm(root)}/${file}`, "utf8");

  const constDefRe = /^\s*const_def\b.*$/gm;
  const first = constDefRe.exec(text);
  if (!first) throw new Error(`loadGbcSpeciesIds: ${file}: no "const_def" line found`);
  const second = constDefRe.exec(text);
  const speciesText = second ? text.slice(0, second.index) : text;

  return new Map([...parseConstDefs(speciesText)].filter(([k]) => !NON_SPECIES.has(k)));
}
