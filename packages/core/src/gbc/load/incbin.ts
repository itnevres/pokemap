export interface IncbinEntry {
  /** The label(s) immediately preceding this INCBIN, in source order.
   *  Stacked labels (multiple names for one file, e.g. two dept-store maps
   *  sharing one .blk) all attach to the same entry. */
  labels: string[];
  path: string;
}

// `Name:` or `Name::`, optionally followed by a `; comment` -- e.g.
// `BetaPlayersHouse2F_Blocks: ; unreferenced` or `TilesetKantoMeta::`.
const LABEL_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)::?\s*(;.*)?$/;

/**
 * Finds every `<keyword> "<path>"` line and the run of label lines
 * immediately preceding it. A blank line never occurs between a label and
 * its directive in the real corpus (verified over data/maps/blocks.asm and
 * gfx/tilesets.asm), so it is treated as inert rather than a reset. Any
 * other intervening line (a comment, the other directive, a macro use)
 * resets the pending label list -- labels only attach when they immediately
 * precede the directive. Shared by `parseIncbins` and `parseIncludes` so the
 * stacked-label logic exists exactly once.
 */
function scanStackedLabels(text: string, keyword: "INCBIN" | "INCLUDE"): IncbinEntry[] {
  const directiveRe = new RegExp(`^\\s*${keyword}\\s+"([^"]+)"`);
  const lines = text.split(/\r\n|\n/);
  const out: IncbinEntry[] = [];
  let pending: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;

    const label = line.match(LABEL_RE);
    if (label) {
      pending.push(label[1]!);
      continue;
    }

    const directive = line.match(directiveRe);
    if (directive) {
      out.push({ labels: pending, path: directive[1]! });
      pending = [];
      continue;
    }

    pending = [];
  }

  return out;
}

/** Only INCBIN, never INCLUDE (used for collision/palette-map .asm files). */
export function parseIncbins(text: string): IncbinEntry[] {
  return scanStackedLabels(text, "INCBIN");
}

/** Only INCLUDE, never INCBIN. Used for the collision and palette-map .asm
 *  files that `gfx/tilesets.asm` and `gfx/tileset_palette_maps.asm` INCLUDE
 *  under stacked labels, the same shape as blocks.asm's INCBINs. */
export function parseIncludes(text: string): IncbinEntry[] {
  return scanStackedLabels(text, "INCLUDE");
}
