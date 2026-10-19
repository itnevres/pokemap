import { existsSync, readFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";
import type { Refusal } from "../write/guards.js";
import { findGbaSign, renderGbaBody } from "../signs/gbaSign.js";
import { replaceLines } from "../gbc/write/asmSplice.js";

export interface IndicatorSpecies { species: string; name: string; percent: number }
export interface IndicatorBlock {
  scriptLabel: string;
  textLabel: string;
  species: string;
  text: string;
  editable: boolean;
  reason?: string;
}

export interface GbaIndicatorInput {
  x: number;
  y: number;
  elevation: number;
  species: string;
  paragraphs: string[][];
}

function bareSpecies(species: string): string {
  const bare = species.toUpperCase().replace(/^SPECIES_/, "");
  if (!/^[A-Z][A-Z0-9_]*$/.test(bare)) throw new Error("invalid Indicator species");
  return bare;
}

export function gbaIndicatorGraphics(species: string): string {
  return `OBJ_EVENT_GFX_SPECIES(${bareSpecies(species)})`;
}

function code(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === "@" && !quoted) return line.slice(0, i).trim();
  }
  return line.trim();
}

function withoutCommentsAndStrings(source: string): string {
  return source.replace(/"(?:\\.|[^"\\\r\n])*"|@[^\r\n]*/g, " ");
}

const labelPattern = /^[A-Za-z_][\w.]*::?$/;

export function buildGbaIndicator(
  mapName: string, incText: string, mapScripts: string[], input: GbaIndicatorInput,
): GbaIndicatorBuild {
  if (!/^[A-Za-z_][\w]*$/.test(mapName)) throw new Error("invalid Indicator map name");
  const species = bareSpecies(input.species);
  if (!input.paragraphs.some(p => p.some(line => line.trim()))) throw new Error("Indicator text must not be empty");
  const body = renderGbaBody(input.paragraphs);
  // Reserve either label anywhere in source, including references without definitions.
  // Species never participates in numbering; select the lowest unused pair.
  // Comments and quoted text mention labels without defining or referencing them.
  const source = withoutCommentsAndStrings(incText + "\n" + mapScripts.join("\n"));
  const used = new Set(source.match(/[A-Za-z_][\w.]*/g) ?? []);
  let n = 1;
  while (used.has(`${mapName}_EventScript_PokemonIndicator${n}`) || used.has(`${mapName}_Text_PokemonIndicator${n}`)) n++;
  const scriptLabel = `${mapName}_EventScript_PokemonIndicator${n}`;
  const textLabel = `${mapName}_Text_PokemonIndicator${n}`;
  const eol = incText.includes("\r\n") ? "\r\n" : "\n";
  const scriptAppendText = [
    `${scriptLabel}::`, "\tlock", "\tfaceplayer", "\twaitse",
    `\tplaymoncry SPECIES_${species}, CRY_MODE_NORMAL`, `\tmsgbox ${textLabel}, MSGBOX_DEFAULT`,
    "\twaitmoncry", "\tclosemessage", "\trelease", "\tend", "", `${textLabel}:`, ...body,
    ...(incText.length === 0 || incText.endsWith("\n") ? [""] : []),
  ].join(eol);
  return {
    objectEvent: {
      graphics_id: gbaIndicatorGraphics(species), x: input.x, y: input.y, elevation: input.elevation,
      movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 1, movement_range_y: 1,
      trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: scriptLabel, flag: "0",
    },
    scriptLabel, textLabel, scriptAppendText,
  };
}

function inspectIndicator(incText: string, event: { graphics_id: string; script: string }) {
  const raw = incText.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const lines = raw.map(code);
  const starts = lines.flatMap((line, i) => line === `${event.script}::` || line === `${event.script}:` ? [i] : []);
  const sections = starts.map(start => {
    const next = lines.findIndex((line, i) => i > start && labelPattern.test(line));
    const end = next < 0 ? lines.length : next;
    return { start, end, indices: lines.flatMap((line, i) => i > start && i < end && line ? [i] : []) };
  });
  // A cry elsewhere in the file must never turn an ordinary NPC into an Indicator.
  if (!sections.some(s => s.indices.some(i => /^playmoncry\b/.test(lines[i]!)))) return null;
  const section = sections[0]!;
  const commands = section.indices.map(i => lines[i]!);
  const cry = commands.map(c => /^playmoncry\s+SPECIES_([A-Z][A-Z0-9_]*),\s*CRY_MODE_NORMAL$/.exec(c)).find(Boolean);
  const msg = commands.map(c => /^msgbox\s+([A-Za-z_][\w.]*),\s*MSGBOX_DEFAULT$/.exec(c)).find(Boolean);
  const block: IndicatorBlock = { scriptLabel: event.script, textLabel: msg?.[1] ?? "", species: cry?.[1] ?? "", text: "", editable: false };
  const refuse = (reason: string) => ({ block: { ...block, reason }, raw, cryLine: -1, bodyStart: 0, bodyEnd: 0, paragraphs: [] as string[][] });
  if (starts.length !== 1 || lines[section.start] !== `${event.script}::` || !cry || !msg || commands.length !== 9
    || commands[0] !== "lock" || commands[1] !== "faceplayer" || commands[2] !== "waitse"
    || !/^playmoncry\s/.test(commands[3]!) || !/^msgbox\s/.test(commands[4]!)
    || commands[5] !== "waitmoncry" || commands[6] !== "closemessage" || commands[7] !== "release" || commands[8] !== "end") {
    return refuse("script does not match the Indicator shape");
  }
  if (event.graphics_id !== gbaIndicatorGraphics(block.species)) return refuse("graphics and cry species disagree");
  // Adapt only this validated script to the Sign parser's msgbox shape, keeping
  // every line index stable. Its text grammar and shared-reference guard remain authoritative.
  const adapted = [...raw];
  for (const i of section.indices) adapted[i] = "\n";
  adapted[section.indices[0]!] = `\tmsgbox ${block.textLabel}, MSGBOX_SIGN\n`;
  adapted[section.indices[1]!] = "\tend\n";
  const sign = findGbaSign(adapted.join(""), event.script);
  if (!sign.editable) return refuse(sign.reason ?? "unsupported text body");
  // Only the tool's own text layout is editable: a re-render must not erase
  // indentation, comments, blank lines or trailing whitespace from the source.
  const body = raw.slice(sign.bodyStart, sign.bodyEnd).map(line => line.replace(/\r?\n$/, ""));
  const canonical = renderGbaBody(sign.paragraphs);
  if (body.length !== canonical.length || body.some((line, i) => line !== canonical[i])) {
    return refuse("text layout changed outside PokeMap");
  }
  // A terminator followed by another command is outside the generated shape.
  const tail = lines.findIndex((line, i) => i >= sign.bodyEnd && labelPattern.test(line));
  if (lines.slice(sign.bodyEnd, tail < 0 ? undefined : tail).some(Boolean)) return refuse("extra text command after terminator");
  block.text = sign.paragraphs.map(p => p.join("\n")).join("\n\n");
  block.editable = true;
  return { block, raw, cryLine: section.indices[3]!, bodyStart: sign.bodyStart, bodyEnd: sign.bodyEnd, paragraphs: sign.paragraphs };
}

export function findGbaIndicator(incText: string, event: { graphics_id: string; script: string }): IndicatorBlock | null {
  return inspectIndicator(incText, event)?.block ?? null;
}

export function updateGbaIndicator(incText: string, block: IndicatorBlock, species: string, paragraphs: string[][]): string {
  if (!block.editable) throw new Error(block.reason ?? "Indicator is not editable");
  const current = inspectIndicator(incText, { script: block.scriptLabel, graphics_id: gbaIndicatorGraphics(block.species) });
  if (!current?.block.editable || current.block.textLabel !== block.textLabel) throw new Error(current?.block.reason ?? "Indicator changed outside PokeMap");
  const bare = bareSpecies(species);
  if (!paragraphs.some(p => p.some(line => line.trim()))) throw new Error("Indicator text must not be empty");
  const body = renderGbaBody(paragraphs);
  let updated = incText;
  if (bare !== current.block.species) {
    // Change only the constant, preserving indentation, comments and line endings.
    // This changes no line counts, including when the text precedes the script.
    const lines = [...current.raw];
    lines[current.cryLine] = lines[current.cryLine]!.replace(/(playmoncry\s+)SPECIES_[A-Z0-9_]+/, `$1SPECIES_${bare}`);
    updated = lines.join("");
  }
  if (JSON.stringify(paragraphs) !== JSON.stringify(current.paragraphs)) {
    updated = replaceLines(updated, current.bodyStart, current.bodyEnd, body);
  }
  return updated;
}

export interface GbaIndicatorBuild {
  /** Raw, snake_case object_events value -- ready for events.ts's own
   *  `addEvent(map, "object", objectEvent)`, matching load/maps.ts's real
   *  field names exactly. */
  objectEvent: Record<string, unknown>;
  scriptLabel: string;
  textLabel: string;
  /** Script block + blank line + text block, ready to hand to a
   *  `ScriptAppend.text` (save.ts's own EditSession.scriptAppends field). */
  scriptAppendText: string;
}

/**
 * The two things that can go wrong ONLY AT WRITE TIME (buildGbaIndicator's own
 * throw already covers the pure-logic case of empty/illegal text) --
 * takes a bare project root rather than a full `Project` so this stays a
 * plain, dependency-free filesystem check exactly like guards.ts's own
 * guards, callable from a route that already has `entry.session` open
 * without re-loading the whole project.
 */
export function guardGbaIndicatorWrite(root: string, mapName: string, scriptLabel: string, species?: string): Refusal[] {
  const scriptsPath = projectPaths(root).mapScriptsInc(mapName);
  if (!existsSync(scriptsPath)) {
    return [{
      code: "NO_SCRIPTS_INC", subject: mapName,
      message: `${mapName} has no scripts.inc`,
      fix: `Create data/maps/${mapName}/scripts.inc before adding a Pok\u00e9mon Indicator here`,
    }];
  }
  // Numbered labels no longer carry a species. New callers supply it explicitly;
  // the three-argument form retains the existing write-time guard contract.
  if (species !== undefined) {
    const namesPath = `${root}/src/data/text/species_names.h`;
    let names: string;
    try { names = readFileSync(namesPath, "utf8"); }
    catch {
      return [{ code: "NO_SPECIES_NAMES", subject: namesPath, message: `Cannot read ${namesPath}`, fix: "Restore the species name table before placing an Indicator" }];
    }
    // Keep quoted strings intact while removing C comments, so commented-out
    // entries cannot authorize an unknown constant.
    const source = names.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
      token => token.startsWith("/") ? " " : token);
    const known = new Set([...source.matchAll(/\[\s*SPECIES_([A-Z][A-Z0-9_]*)\s*\]\s*=\s*_\(\s*"(?:\\.|[^"\\])*"\s*\)/g)].map(m => m[1]!));
    if (!known.has(bareSpecies(species))) {
      return [{ code: "UNKNOWN_SPECIES", subject: namesPath, message: `${species} is not in ${namesPath}`, fix: "Choose a species defined in the subject's species_names.h" }];
    }
  }
  const text = readFileSync(scriptsPath, "utf8");
  if (withoutCommentsAndStrings(text).split(/\r?\n/).some(line => {
    return /^\s*([A-Za-z_][\w.]*)::?(?=\s|$)/.exec(line)?.[1] === scriptLabel;
  })) {
    return [{
      code: "SIGN_LABEL_EXISTS", subject: scriptLabel,
      message: `${scriptLabel} is already defined in ${mapName}/scripts.inc`,
      fix: "Choose a different species, or edit the existing script by hand",
    }];
  }
  return [];
}
