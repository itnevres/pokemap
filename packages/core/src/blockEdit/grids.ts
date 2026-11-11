import type { GridIds } from "./types.js";

/**
 * GBA block metatile ids are 10 bits in the default profile; pass a project's
 * own `profile.blockMetatileIdMask` when it differs. Session blocks parsed by
 * `parseBlocks` are already masked, so this is a guard against a hand-built
 * draft, mirroring what a grid write would otherwise store.
 */
export function gbaGridIds(blocks: readonly { metatileId: number }[], mask = 0x3ff): GridIds {
  return blocks.map((b) => b.metatileId & mask);
}

/** GBC block ids are one byte (`data/maps/*.blk`), so mask to 0xff. */
export function gbcGridIds(blocks: readonly { metatileId: number }[]): GridIds {
  return blocks.map((b) => b.metatileId & 0xff);
}
