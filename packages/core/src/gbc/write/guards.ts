import { readFileSync } from "node:fs";
import type { Refusal } from "../../write/guards.js";
import type { GbcProject } from "../project.js";
import { encodeBlk } from "../load/blocks.js";
import { objectConstDefLine } from "../load/events.js";
import type { Block, Layout } from "../model/types.js";
import type { GbcEditSession } from "./save.js";

/** The layout's `.blk` on disk. One function for BOTH the guard's read and the
 *  commit's write, so the file checked is the file written by construction
 *  (it is `layout.blkPath`, never derived from the map name: 50 maps share
 *  House1.blk). */
export function blkFilePath(proj: Pick<GbcProject, "root">, layout: Pick<Layout, "blkPath">): string {
  return `${proj.root}/${layout.blkPath}`;
}

/** `maps/<mapName>.asm` on disk (the fixed path, GBC findings §3.1); shared by
 *  open, the guard's read, and commit's write for the same reason as above. */
export function eventsFilePath(proj: Pick<GbcProject, "root">, mapName: string): string {
  return `${proj.root}/maps/${mapName}.asm`;
}

/** Ascending indices `i < min(len)` whose `metatileId` differs. Ids are the
 *  whole of a GBC block (no collision/elevation bits), so this is exactly
 *  the set of bytes a save must patch. Lives here (re-exported by save.ts) so
 *  this module needs only a type import from save.ts: no runtime cycle. */
export function changedBlockIndices(original: Block[], current: Block[]): number[] {
  const out: number[] = [];
  const n = Math.min(original.length, current.length);
  for (let i = 0; i < n; i++) if (original[i]!.metatileId !== current[i]!.metatileId) out.push(i);
  return out;
}

/** The file's bytes, or `null` when it cannot be read (deleted under us counts as changed). */
function tryRead(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/**
 * Refusals for one GBC save, checked against the session's CURRENT state
 * (`planGbcSave` snapshots them for display; `commitGbcSave` re-runs this
 * fresh as the real gate). Pure and read-only: it may READ the files on disk
 * but never writes (noStrayWrites enforces that for this file).
 *
 * Deliberately not here: a warp-tile-moved check (not in Plan 7's G4 list)
 * and a ">15 objects" check (`parseMapEvents` already throws past 15, so a
 * session's `events` can never exceed it; Task 3's add-object op refuses
 * before splicing).
 */
export function guardGbcSave(proj: GbcProject, session: GbcEditSession): Refusal[] {
  const { layout, map } = session;
  const out: Refusal[] = [];

  if (session.blocks.length !== session.originalBlocks.length) {
    out.push({
      code: "blocks-length-changed",
      message: `${layout.blkPath}: ${session.blocks.length} block(s), but it opened with ${session.originalBlocks.length}.`,
      fix: "A block edit repaints existing blocks; it must never add or drop one (the map's width x height is fixed by map_constants.asm).",
      subject: layout.blkPath,
    });
  }

  // Checked over ALL current blocks, not just the painted ones, as GBA's is:
  // the corpus has 0 out-of-range ids, so an unedited real map never refuses.
  const cap = proj.tileset(map.tileset).metatiles.length;
  const bad = new Set<number>();
  for (const b of session.blocks) {
    if (!Number.isInteger(b.metatileId) || b.metatileId < 0 || b.metatileId >= cap) bad.add(b.metatileId);
  }
  if (bad.size > 0) {
    out.push({
      code: "metatile-out-of-range",
      message: `${layout.blkPath}: metatile id(s) ${[...bad].sort((a, b) => a - b).join(", ")} are out of range for ${map.tileset}.`,
      fix: `${map.tileset} has ${cap} metatiles (valid ids 0-${cap - 1}). Pick an id below that.`,
      subject: layout.blkPath,
    });
  }

  const changed = changedBlockIndices(session.originalBlocks, session.blocks);
  const blocksChanged = changed.length > 0;

  // Object consts are the hand-maintained object index (findings §3.1) and
  // scripts address objects through them. Adding/removing an object_event
  // without the matching const silently re-points every later object. When
  // the file had no object_const_def (40 of 391 maps), gaining one is the
  // desync instead.
  const textChanged = session.eventsText !== session.originalEventsText;
  const eventsFile = `maps/${session.mapName}.asm`;
  const constDelta = session.events.objectConsts.length - session.originalEvents.objectConsts.length;
  const objectDelta = session.events.objects.length - session.originalEvents.objects.length;
  const desync =
    objectConstDefLine(session.originalEventsText) !== null
      ? constDelta !== objectDelta
      : session.events.objectConsts.length !== 0;
  if (desync) {
    out.push({
      code: "object-const-desync",
      message: `${eventsFile}: object_event count changed by ${objectDelta} but object_const_def changed by ${constDelta}.`,
      fix: "Add or remove the matching `const` line with every object_event (a map with no object_const_def must stay without one).",
      subject: eventsFile,
    });
  }

  // Reads only: refuse (never clobber) when the file on disk is no longer what
  // this session opened. Only checked for a file this save would write. The
  // .blk check compares just the prefix the patch writes into -- bytes past
  // that are never touched, so they need not match.
  if (blocksChanged) {
    const n = session.originalBlocks.length;
    const disk = tryRead(blkFilePath(proj, layout));
    if (!disk || disk.length < n || !disk.subarray(0, n).equals(encodeBlk(session.originalBlocks))) {
      out.push({
        code: "file-changed-on-disk",
        message: `${layout.blkPath} changed on disk since this session opened it.`,
        fix: "Reopen the map to pick up the new contents, then redo your edit.",
        subject: layout.blkPath,
      });
    }
  }
  if (textChanged && tryRead(eventsFilePath(proj, session.mapName))?.toString("utf8") !== session.originalEventsText) {
    out.push({
      code: "file-changed-on-disk",
      message: `${eventsFile} changed on disk since this session opened it.`,
      fix: "Reopen the map to pick up the new contents, then redo your edit.",
      subject: eventsFile,
    });
  }

  return out;
}
