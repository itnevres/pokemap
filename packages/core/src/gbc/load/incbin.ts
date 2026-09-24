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
// Only INCBIN, never INCLUDE (used for collision .asm in gfx/tilesets.asm) --
// callers filter the returned paths (e.g. by extension) as they need.
const INCBIN_RE = /^\s*INCBIN\s+"([^"]+)"/;

/**
 * Finds every `INCBIN "<path>"` line and the run of label lines immediately
 * preceding it. A blank line never occurs between a label and its INCBIN in
 * the real corpus (verified over data/maps/blocks.asm and gfx/tilesets.asm),
 * so it is treated as inert rather than a reset. Any other intervening line
 * (a comment, an INCLUDE, a macro use) resets the pending label list --
 * labels only attach when they immediately precede the INCBIN.
 */
export function parseIncbins(text: string): IncbinEntry[] {
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

    const incbin = line.match(INCBIN_RE);
    if (incbin) {
      out.push({ labels: pending, path: incbin[1]! });
      pending = [];
      continue;
    }

    pending = [];
  }

  return out;
}
