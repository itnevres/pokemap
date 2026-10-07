import { readFileSync } from "node:fs";
import type { Refusal } from "../../write/guards.js";
import type { GbcProject } from "../project.js";
import { encodeBlk } from "../load/blocks.js";
import { changedBlockIndices, type GbcEditSession } from "./save.js";

/** The file's bytes, or `null` when it cannot be read (deleted under us counts as changed). */
function tryRead(path: string, encoding?: "utf8"): Buffer | string | null {
  try {
    return encoding ? readFileSync(path, encoding) : readFileSync(path);
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

  // An unchanged non-writable layout is not refused: nothing would be written
  // to it. Writable is false when the .blk's size disagreed with w*h at load.
  if (!layout.writable && blocksChanged) {
    out.push({
      code: "layout-not-writable",
      message: `${layout.blkPath} was flagged non-writable when loaded (its size on disk disagrees with ${layout.width}x${layout.height}).`,
      fix: "Fix the file's size to match the map's declared dimensions in the decomp, then reopen.",
      subject: layout.blkPath,
    });
  }

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
    session.originalEvents.objectConsts.length > 0
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
    const disk = tryRead(`${proj.root}/${layout.blkPath}`) as Buffer | null;
    if (!disk || disk.length < n || !disk.subarray(0, n).equals(encodeBlk(session.originalBlocks))) {
      out.push({
        code: "file-changed-on-disk",
        message: `${layout.blkPath} changed on disk since this session opened it.`,
        fix: "Reopen the map to pick up the new contents, then redo your edit.",
        subject: layout.blkPath,
      });
    }
  }
  if (textChanged && tryRead(`${proj.root}/${eventsFile}`, "utf8") !== session.originalEventsText) {
    out.push({
      code: "file-changed-on-disk",
      message: `${eventsFile} changed on disk since this session opened it.`,
      fix: "Reopen the map to pick up the new contents, then redo your edit.",
      subject: eventsFile,
    });
  }

  return out;
}
