import type { Refusal } from "../../write/guards.js";
import type { GbcProject } from "../project.js";
import type { GbcEditSession } from "./save.js";

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

  return out;
}
