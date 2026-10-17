import { readFileSync } from "node:fs";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { findGbcSign, updateGbcSign } from "@pokemap/core/src/gbc/signs.js";
import { parseGbcCharmap } from "@pokemap/core/src/signs/charmap.js";
import { gbcMapDisplayName, linkedSpecies, linkedText } from "@pokemap/core/src/signs/linked.js";
import { signHash, type SignMode } from "@pokemap/core/src/signs/marker.js";
import { wrapSign } from "@pokemap/core/src/signs/wrap.js";
import type { GbcSessionEntry } from "./gbcEditSessions.js";

export interface SignNotice { scriptLabel: string; message: string }

export function gbcSignLabels(text: string): string[] {
  return [...text.matchAll(/^[ \t]*([A-Za-z_][\w.]*)::?[ \t]*(?:;[^\r\n]*)?\r?$/gm)].map((m) => m[1]!);
}

export function gbcSignParagraphs(proj: GbcProject, entry: GbcSessionEntry, mode: SignMode, text: string): string[][] {
  if (mode !== "free") {
    // Project wild/header caches can predate edits made outside the editor.
    const current = openGbcProject(proj.root);
    text = linkedText(mode, gbcMapDisplayName(current.root, current.map(entry.session.mapName)),
      mode === "species" ? linkedSpecies("gbc", current, entry.session.mapName) : []);
  }
  const path = `${proj.root}/constants/charmap.asm`;
  const wrapped = wrapSign(text, parseGbcCharmap(readFileSync(path, "utf8")), 18);
  if ("refusal" in wrapped) throw new Error(`${path}: ${wrapped.refusal}`);
  if (!wrapped.paragraphs.length) throw new Error(`${path}: sign text must not be empty`);
  return wrapped.paragraphs;
}

/** Preview and commit use this same pure refresh; the user's undo stack is untouched. */
export function refreshGbcLinkedSigns(proj: GbcProject, entry: GbcSessionEntry) {
  const session = { ...entry.session };
  const notices: SignNotice[] = [];
  for (const label of gbcSignLabels(session.eventsText)) {
    const block = findGbcSign(session.eventsText, label);
    if (!block.marker || block.marker.mode === "free") continue;
    if (!block.editable || signHash(block.body) !== block.marker.hash) {
      notices.push({ scriptLabel: label, message: `${label} was edited outside PokeMap and was not refreshed.` });
      continue;
    }
    const paragraphs = gbcSignParagraphs(proj, entry, block.marker.mode, "");
    session.eventsText = updateGbcSign(session.eventsText, block, block.marker.mode, paragraphs, { force: false });
  }
  session.events = parseMapEvents(session.eventsText, session.mapName);
  return { session, notices };
}
