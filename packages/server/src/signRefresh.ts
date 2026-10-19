import { openProject, type Project } from "@pokemap/core/src/project.js";
import { applyScriptAppend, type EditSession } from "@pokemap/core/src/write/save.js";
import { findGbaSign, updateGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { parseGbaCharmap } from "@pokemap/core/src/signs/charmap.js";
import { gbaMapDisplayName } from "@pokemap/core/src/signs/linked.js";
import type { SessionEntry } from "./editSessions.js";
import { existsSync, readFileSync } from "node:fs";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { findGbcSign, updateGbcSign } from "@pokemap/core/src/gbc/signs.js";
import { parseGbcCharmap } from "@pokemap/core/src/signs/charmap.js";
import { gbcMapDisplayName, linkedSpecies, linkedText } from "@pokemap/core/src/signs/linked.js";
import { signHash, type SignMode } from "@pokemap/core/src/signs/marker.js";
import { wrapSign, SIGN_WIDTH } from "@pokemap/core/src/signs/wrap.js";
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
  const wrapped = wrapSign(text, parseGbcCharmap(readFileSync(path, "utf8")), SIGN_WIDTH);
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

/** Pending edits are applied in the same order as commitSave. */
export function effectiveGbaScripts(proj: Project, session: EditSession): string {
  const path = proj.paths.mapScriptsInc(session.mapName);
  let text = session.scriptReplaces?.filter((r) => r.path === path).at(-1)?.after ?? readFileSync(path, "utf8");
  for (const append of session.scriptAppends ?? []) if (append.path === path) text = applyScriptAppend(text, append);
  return text;
}

export function gbaSignLabels(text: string): string[] {
  return [...text.matchAll(/^[ \t]*([A-Za-z_][\w.]*)::[ \t]*(?:@[^\r\n]*)?\r?$/gm)].map((m) => m[1]!);
}

/** Fold this path's staged operations into one guarded replacement (R-e). */
export function replaceGbaScripts(proj: Project, session: EditSession, after: string): void {
  const path = proj.paths.mapScriptsInc(session.mapName);
  const before = session.scriptReplaces?.find((r) => r.path === path)?.before ?? readFileSync(path, "utf8");
  session.scriptReplaces = [...(session.scriptReplaces ?? []).filter((r) => r.path !== path), ...(before === after ? [] : [{ path, before, after }])];
  session.scriptAppends = (session.scriptAppends ?? []).filter((a) => a.path !== path);
}

export function gbaSignParagraphs(proj: Project, entry: SessionEntry, mode: SignMode, text: string): string[][] {
  if (mode !== "free") {
    const current = openProject(proj.paths.root);
    text = linkedText(mode, gbaMapDisplayName(current, entry.session.map),
      mode === "species" ? linkedSpecies("gba", current, entry.session.mapName) : []);
  }
  const path = `${proj.paths.root}/charmap.txt`;
  const wrapped = wrapSign(text, parseGbaCharmap(readFileSync(path, "utf8")), SIGN_WIDTH);
  if ("refusal" in wrapped) throw new Error(`${path}: ${wrapped.refusal}`);
  if (!wrapped.paragraphs.length) throw new Error(`${path}: sign text must not be empty`);
  return wrapped.paragraphs;
}

/** Pure: only the returned session owns refreshed operations; undo state is untouched. */
export function refreshGbaLinkedSigns(proj: Project, entry: SessionEntry) {
  const session = { ...entry.session };
  const notices: SignNotice[] = [];
  // Missing scripts.inc is harmless to a paint-only save; sign operations still require it.
  const path = proj.paths.mapScriptsInc(session.mapName);
  if (!existsSync(path) && !session.map.bgEvents.some(e => e.type === "sign") && !session.scriptReplaces?.some(r => r.path === path) && !session.scriptAppends?.some(a => a.path === path)) return { session, notices };
  const before = effectiveGbaScripts(proj, session);
  let text = before;
  for (const label of gbaSignLabels(text)) {
    const block = findGbaSign(text, label);
    if (!block.marker || block.marker.mode === "free") continue;
    if (!block.editable || signHash(block.body) !== block.marker.hash) {
      notices.push({ scriptLabel: label, message: `${label} was edited outside PokeMap and was not refreshed.` });
      continue;
    }
    text = updateGbaSign(text, block, block.marker.mode, gbaSignParagraphs(proj, entry, block.marker.mode, ""), { force: false });
  }
  if (text !== before) replaceGbaScripts(proj, session, text);
  return { session, notices };
}
