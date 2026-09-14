import { existsSync, readFileSync } from "node:fs";
import type { EngineProfile } from "../config/engine.js";
import type { Block, Layout } from "../model/types.js";
import { encodeBlocks } from "../load/blocks.js";

export interface BinaryWrite { path: string; bytes: Buffer; changedBlocks: number[]; }

function diffChangedBlocks(prevBytes: Buffer, next: Buffer): number[] {
  const changedBlocks: number[] = [];
  const blockCount = Math.max(prevBytes.length, next.length) >> 1;
  for (let i = 0; i < blockCount; i++) {
    const prevWord = i * 2 + 1 < prevBytes.length ? prevBytes.readUInt16LE(i * 2) : undefined;
    const nextWord = i * 2 + 1 < next.length ? next.readUInt16LE(i * 2) : undefined;
    if (prevWord !== nextWord) changedBlocks.push(i);
  }
  return changedBlocks;
}

/**
 * Compares the encoding of `blocks` against whatever is currently on disk
 * at `root/layout.blockdataFilepath`, returning null on an exact match so
 * opening a map and saving it without edits produces no write at all (I6's
 * own "no write when nothing changed" half, one level below the save
 * funnel's own dirty-flag check).
 *
 * Encodes the WHOLE `blocks` array handed to it -- never reconstructs a
 * length from `layout.width * layout.height`. 19 real layouts in the
 * subject corpus carry exactly one block past their declared dimensions
 * (Plan 1 Task 11's own measurement, an upstream artifact invisible to the
 * renderer but not to a writer); `parseBlocks` already includes that tail
 * (it reads `buf.length >> 1`, not the layout's own width*height), so as
 * long as callers pass through what `parseBlocks` gave them -- which the
 * save funnel (Task 4) does -- the tail survives untouched.
 */
export function planBlockdataWrite(
  root: string, layout: Layout, blocks: Block[], profile: EngineProfile,
): BinaryWrite | null {
  const path = `${root}/${layout.blockdataFilepath}`;
  const next = encodeBlocks(blocks, profile); // throws on an out-of-mask value -- I7, not this function's job to catch twice

  const prevBytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  if (prevBytes.equals(next)) return null;

  return { path, bytes: next, changedBlocks: diffChangedBlocks(prevBytes, next) };
}

/**
 * Identical shape for border.bin -- kept as a separate exported function
 * rather than a `kind` parameter on `planBlockdataWrite`, since the two
 * targets' paths (`blockdataFilepath` vs `borderFilepath`) and their own
 * length invariants (border.bin has NO trailing-block exception -- all
 * 1,020 real border.bin files match borderWidth*borderHeight exactly, per
 * Plan 1 Task 11's own measurement) are different enough that merging them
 * behind one flag would be the "same defect in different disguises" this
 * project's own history warns about, not a real simplification.
 */
export function planBorderWrite(
  root: string, layout: Layout, border: Block[], profile: EngineProfile,
): BinaryWrite | null {
  const path = `${root}/${layout.borderFilepath}`;
  const next = encodeBlocks(border, profile);
  const prevBytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  if (prevBytes.equals(next)) return null;

  return { path, bytes: next, changedBlocks: diffChangedBlocks(prevBytes, next) };
}
