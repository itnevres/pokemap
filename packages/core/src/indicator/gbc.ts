import type { IndicatorBlock } from "./gba.js";
import { gbcIndicatorSprite } from "./gbcData.js";
import { addGbcEvent } from "../gbc/edit/events.js";
import { scanCalls } from "../gbc/load/asm.js";
import { renderGbcBody } from "../gbc/signs.js";
import { locateEventCall, replaceLines, spliceArg } from "../gbc/write/asmSplice.js";

// Strip comments without mistaking a semicolon in dialogue for a comment.
function code(line: string): string {
  return line.replace(/"(?:\\.|[^"\\])*"|;.*$/g, token => token.startsWith(";") ? "" : token).trim();
}

function symbols(line: string): string[] {
  return line.replace(/"(?:\\.|[^"\\])*"|;.*$/g, " ").match(/[A-Za-z_][\w.]*/g) ?? [];
}

const label = /^[A-Za-z_.][\w.]*::?$/;
const rawLines = (text: string): string[] => (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(line => line.replace(/\r?\n$/, ""));

function refusal(mapName: string, message: string, line?: number, fix = "Restore the Indicator's generated shape or choose valid Indicator input before retrying."): Error {
  return new Error(`maps/${mapName}.asm:${line === undefined ? "" : `${line + 1}:`} ${message}. ${fix}`);
}

function validate(mapName: string, species: string, sprite: string, paragraphs: string[][]): string[] {
  if (!/^[A-Za-z_][\w]*$/.test(mapName) || !/^[A-Z][A-Z0-9_]*$/.test(species) || !/^SPRITE_[A-Z0-9_]+$/.test(sprite)) {
    throw refusal(mapName, "invalid map, species or sprite identifier");
  }
  if (!paragraphs.some(p => p.some(line => line.trim()))) throw refusal(mapName, "Indicator text must not be empty");
  try { return renderGbcBody(paragraphs); }
  catch (error) { throw refusal(mapName, (error as Error).message); }
}

export function insertGbcIndicator(
  text: string, mapName: string,
  input: { x: number; y: number; species: string; sprite: string; paragraphs: string[][] },
): { text: string; scriptLabel: string } {
  const body = validate(mapName, input.species, input.sprite, input.paragraphs);
  const anchors = rawLines(text).flatMap((line, i) => code(line) === `${mapName}_MapEvents:` ? [i] : []);
  if (anchors.length !== 1) throw refusal(mapName, `expected one ${mapName}_MapEvents: label`, anchors[0]);
  const used = new Set(symbolsByLine(text).flat());
  let n = 1;
  while (used.has(`${mapName}PokemonIndicator${n}`) || used.has(`${mapName}PokemonIndicator${n}Text`)) n++;
  const scriptLabel = `${mapName}PokemonIndicator${n}`;
  const textLabel = `${scriptLabel}Text`;
  let added: string;
  try {
    added = addGbcEvent(text, mapName, "object", [
      String(input.x), String(input.y), input.sprite, "SPRITEMOVEDATA_POKEMON", "0", "0", "-1", "-1", "0",
      "OBJECTTYPE_SCRIPT", "0", scriptLabel, "-1",
    ]).text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outOfStep = message.includes("object_const_def");
    const capped = message.includes("the maximum");
    const missingSection = /(?:no|missing) "def_/.test(message);
    const marker = outOfStep ? "object_const_def" : "def_object_events";
    const markerLine = rawLines(text).findIndex(line => code(line) === marker);
    const fix = outOfStep ? "Make object_const_def list one const per object_event."
      : capped ? "Remove an object_event from this map or place the Indicator on another map."
      : missingSection ? `Restore the missing event section markers below ${mapName}_MapEvents:.`
      : "Restore the map's event sections or choose valid object_event arguments before retrying.";
    throw refusal(mapName, message, markerLine < 0 ? anchors[0] : markerLine, fix);
  }
  const anchor = rawLines(added).findIndex(line => code(line) === `${mapName}_MapEvents:`);
  // Same multi-line insertion primitive as insertGbcSign; never reconstruct the file.
  return { scriptLabel, text: replaceLines(added, anchor, anchor, [
    `${scriptLabel}:`, "\tfaceplayer", "\topentext", `\twritetext ${textLabel}`, `\tcry ${input.species}`,
    "\twaitbutton", "\tclosetext", "\tend", "", `${textLabel}:`, ...body, "",
  ]) };
}

function symbolsByLine(text: string): string[][] {
  return rawLines(text).map(symbols);
}

function inspect(text: string, event: { sprite: string; script: string }, own: Set<string>) {
  const raw = rawLines(text);
  const lines = raw.map(code);
  const starts = lines.flatMap((line, i) => line === `${event.script}:` || line === `${event.script}::` ? [i] : []);
  const sections = starts.map(start => {
    const next = lines.findIndex((line, i) => i > start && label.test(line));
    const end = next < 0 ? lines.length : next;
    return { start, indices: lines.flatMap((line, i) => i > start && i < end && line ? [i] : []) };
  });
  if (!sections.some(s => s.indices.some(i => /^cry\b/.test(lines[i]!)))) return null;
  const section = sections[0]!;
  const commands = section.indices.map(i => lines[i]!);
  const cry = commands.map(c => /^cry\s+([A-Z][A-Z0-9_]*)$/.exec(c)).find(Boolean);
  const msg = commands.map(c => /^writetext\s+([A-Za-z_][\w.]*)$/.exec(c)).find(Boolean);
  const block: IndicatorBlock = {
    scriptLabel: event.script, textLabel: msg?.[1] ?? "", species: cry?.[1] ?? "", text: "", editable: false,
  };
  const result = { block, cryLine: section.indices[3] ?? section.start, bodyStart: 0, bodyEnd: 0, paragraphs: [] as string[][] };
  const refuse = (reason: string) => ({ ...result, block: { ...block, reason } });
  if (starts.length !== 1 || lines[section.start] !== `${event.script}:` || !cry || !msg || commands.length !== 7
    || commands[0] !== "faceplayer" || commands[1] !== "opentext" || !/^writetext\s/.test(commands[2]!)
    || !/^cry\s/.test(commands[3]!) || commands[4] !== "waitbutton" || commands[5] !== "closetext" || commands[6] !== "end") {
    return refuse("script does not match the Indicator shape");
  }
  // Exactly one object may own the script. Any other real reference could
  // observe a changed cry while retaining an incompatible object sprite.
  const owners = scanCalls(text, "object_event").filter(call => call.args[11]?.text === event.script);
  const references = symbolsByLine(text);
  if (owners.length > 1 || references.some((tokens, i) => {
    if (i === section.start) return false;
    const count = tokens.filter(token => token === event.script).length;
    return count > (i === owners[0]?.lineIndex ? 1 : 0);
  })) return refuse("shared script");
  if (event.sprite !== gbcIndicatorSprite(block.species, own)) return refuse("sprite and cry species disagree");
  const texts = lines.flatMap((line, i) => line === `${block.textLabel}:` || line === `${block.textLabel}::` ? [i] : []);
  if (texts.length !== 1 || lines[texts[0]!] !== `${block.textLabel}:`) return refuse("text label not found exactly once in this file");
  const textStart = texts[0]!;
  // Real references reserve ownership; comments and dialogue literals do not.
  if (symbolsByLine(text).some((tokens, i) => i !== textStart && i !== section.indices[2] && tokens.includes(block.textLabel))) {
    return refuse("shared text");
  }
  const paragraphs: string[][] = [];
  let bodyEnd = -1;
  for (let i = textStart + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (label.test(line)) break;
    if (line === "done") { bodyEnd = i + 1; break; }
    if (!line) continue;
    const command = /^(text|line|cont|para)\s+"([^"\r\n]*)"$/.exec(line);
    if (!command || (paragraphs.length === 0 ? command[1] !== "text" : command[1] === "text")) return refuse("unsupported text body");
    if (command[1] === "text" || command[1] === "para") paragraphs.push([command[2]!]);
    else paragraphs.at(-1)!.push(command[2]!);
  }
  if (bodyEnd < 0 || paragraphs.length === 0) return refuse("text body is missing text or done");
  let canonical: string[];
  try { canonical = renderGbcBody(paragraphs); }
  catch { return refuse("unsupported text body"); }
  const body = raw.slice(textStart + 1, bodyEnd);
  if (body.length !== canonical.length || body.some((line, i) => line !== canonical[i])) {
    return refuse("text layout changed outside PokeMap");
  }
  const next = lines.findIndex((line, i) => i >= bodyEnd && label.test(line));
  if (lines.slice(bodyEnd, next < 0 ? undefined : next).some(Boolean)) return refuse("extra text command after terminator");
  block.editable = true;
  block.text = paragraphs.map(p => p.join("\n")).join("\n\n");
  return { block, cryLine: section.indices[3]!, bodyStart: textStart + 1, bodyEnd, paragraphs };
}

export function findGbcIndicator(text: string, event: { sprite: string; script: string }, own: Set<string>): IndicatorBlock | null {
  return inspect(text, event, own)?.block ?? null;
}

export function updateGbcIndicator(
  text: string, mapName: string, objectIndex: number, block: IndicatorBlock,
  species: string, sprite: string, paragraphs: string[][],
): string {
  let call: ReturnType<typeof locateEventCall>;
  try { call = locateEventCall(text, mapName, "object_event", objectIndex); }
  catch (error) { throw refusal(mapName, (error as Error).message); }
  if (!block.editable) throw refusal(mapName, block.reason ?? "Indicator is not editable", call.lineIndex);
  if (call.args[11]?.text !== block.scriptLabel) throw refusal(mapName, "object script no longer matches this Indicator", call.lineIndex);
  const currentSprite = call.args[2]!.text;
  // The recogniser's caller supplied the subject's own-sprite set. Here retain
  // that validated choice while rechecking the current source and object.
  const own = new Set(currentSprite === `SPRITE_${block.species}` ? [block.species] : []);
  const current = inspect(text, { sprite: currentSprite, script: block.scriptLabel }, own);
  if (!current?.block.editable || current.block.textLabel !== block.textLabel || current.block.species !== block.species) {
    throw refusal(mapName, current?.block.reason ?? "Indicator changed outside PokeMap", call.lineIndex);
  }
  const body = validate(mapName, species, sprite, paragraphs);
  // Apply line replacements bottom-up so either source ordering is safe.
  const edits: { start: number; end: number; lines: string[] }[] = [];
  if (species !== current.block.species) {
    const line = rawLines(text)[current.cryLine]!;
    edits.push({ start: current.cryLine, end: current.cryLine + 1, lines: [line.replace(/(\bcry\s+)[A-Z][A-Z0-9_]*/, `$1${species}`)] });
  }
  if (JSON.stringify(paragraphs) !== JSON.stringify(current.paragraphs)) {
    edits.push({ start: current.bodyStart, end: current.bodyEnd, lines: body });
  }
  let updated = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) updated = replaceLines(updated, edit.start, edit.end, edit.lines);
  if (sprite !== currentSprite) {
    updated = spliceArg(updated, locateEventCall(updated, mapName, "object_event", objectIndex), 2, sprite);
  }
  return updated;
}
