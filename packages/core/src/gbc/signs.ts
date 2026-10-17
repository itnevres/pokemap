import { codeLines } from "./load/asm.js";
import { replaceLines } from "./write/asmSplice.js";
import { formatMarker, parseMarker, signHash, type SignBlock, type SignMode } from "../signs/marker.js";

// Text literals can contain semicolons; the expression-only asm stripper cannot be used here.
function code(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ";" && !quoted) return line.slice(0, i).trim();
  }
  return line.trim();
}

function source(text: string) {
  return codeLines(text).map((line) => ({ ...line, code: code(line.text) }));
}

function isLabel(line: string): boolean {
  return /^[A-Za-z_.][\w.]*::?$/.test(line);
}

export function findGbcSign(text: string, scriptLabel: string): SignBlock {
  const lines = source(text);
  const block: SignBlock = {
    scriptLabel, textLabel: null, editable: false, reason: null,
    marker: null, bodyStart: 0, bodyEnd: 0, body: "", paragraphs: [],
  };
  const refuse = (reason: string): SignBlock => ({ ...block, reason });
  const scripts = lines.filter((line) => line.code === `${scriptLabel}:`);
  if (scripts.length !== 1) return refuse("script is not a single jumptext");
  const rawLines = text.split(/\r?\n/);
  const scriptIndex = lines.indexOf(scripts[0]!);
  const nextLabel = lines.slice(scriptIndex + 1).find((line) => isLabel(line.code));
  const commands = rawLines.slice(scripts[0]!.lineIndex + 1, nextLabel?.lineIndex).map(code).filter(Boolean);
  const jump = commands.length === 1 ? /^jumptext\s+([A-Za-z_][\w.]*)$/.exec(commands[0]!) : null;
  if (!jump) return refuse("script is not a single jumptext");
  const textLabel = jump[1]!;
  block.textLabel = textLabel;
  const labels = lines.filter((line) => line.code === `${textLabel}:`);
  if (labels.length !== 1) return refuse("text label not found in this file");
  const references = lines.filter((line) => {
    const ref = /^(?:jumptext|writetext|text_far)\s+(\S+)$/.exec(line.code);
    return ref?.[1] === textLabel;
  });
  if (references.length !== 1) return refuse("shared text");
  const label = labels[0]!;
  block.marker = parseMarker(rawLines[label.lineIndex - 1] ?? "");
  block.bodyStart = label.lineIndex + 1;
  let nextLine = block.bodyStart;
  for (const line of lines.slice(lines.indexOf(label) + 1)) {
    // A skipped macro definition is not part of the supported text grammar.
    const skipped = rawLines.slice(nextLine, line.lineIndex).map(code).find(Boolean);
    if (skipped) return refuse(`unsupported text command ${skipped.split(/\s/)[0]}`);
    nextLine = line.lineIndex + 1;
    if (line.code === "done") {
      if (block.paragraphs.length === 0) return refuse("unsupported text command done");
      block.bodyEnd = line.lineIndex + 1;
      const bodyOffset = label.end + (text.startsWith("\r\n", label.end) ? 2 : 1);
      const endOffset = line.end + (text.startsWith("\r\n", line.end) ? 2 : text[line.end] === "\n" ? 1 : 0);
      block.body = text.slice(bodyOffset, endOffset);
      block.editable = true;
      return block;
    }
    if (!line.code) continue;
    if (isLabel(line.code)) break;
    const command = /^(text|line|cont|para)\s+"([^"\r\n]*)"$/.exec(line.code);
    if (!command) return refuse(`unsupported text command ${line.code.split(/\s/)[0]}`);
    const [, cmd, value] = command;
    if (block.paragraphs.length === 0 ? cmd !== "text" : cmd === "text") {
      return refuse(`unsupported text command ${cmd}`);
    }
    if (cmd === "text" || cmd === "para") block.paragraphs.push([value!]);
    else block.paragraphs.at(-1)!.push(value!);
  }
  return refuse("unsupported text command missing done");
}

export function renderGbcBody(paragraphs: string[][]): string[] {
  if (paragraphs.length === 0 || paragraphs.some((p) => p.length === 0)) {
    throw new Error("sign text must contain a nonempty paragraph");
  }
  const lines: string[] = [];
  paragraphs.forEach((paragraph, p) => {
    if (p > 0) lines.push("");
    paragraph.forEach((line, i) => {
      if (/["@\r\n\\]/.test(line)) throw new Error("unsupported sign text character");
      const cmd = i === 0 ? (p === 0 ? "text" : "para") : i === 1 ? "line" : "cont";
      lines.push(`\t${cmd} "${line}"`);
    });
  });
  return [...lines, "\tdone"];
}

export function nextGbcSignNumber(text: string, mapName: string): number {
  const labels = new Set(source(text).map((line) => line.code));
  let n = 1;
  while (labels.has(`${mapName}PokemapSign${n}:`)) n++;
  return n;
}

export function insertGbcSign(text: string, mapName: string, n: number, mode: SignMode, paragraphs: string[][]): string {
  if (!/^[A-Za-z_][\w]*$/.test(mapName) || !Number.isSafeInteger(n) || n < 1) throw new Error("invalid sign label");
  const lines = source(text);
  const scriptLabel = `${mapName}PokemapSign${n}`;
  const textLabel = `${scriptLabel}Text`;
  if (lines.some((line) => [scriptLabel, textLabel].some((label) => line.code === `${label}:` || line.code === `${label}::`))) {
    throw new Error(`label collision: ${scriptLabel} / ${textLabel}`);
  }
  const anchors = lines.filter((line) => line.code === `${mapName}_MapEvents:`);
  if (anchors.length !== 1) throw new Error(`missing ${mapName}_MapEvents: label`);
  const body = renderGbcBody(paragraphs);
  const marker = formatMarker("gbc", mode, signHash(body.join("\n") + "\n"));
  return replaceLines(text, anchors[0]!.lineIndex, anchors[0]!.lineIndex, [
    `${scriptLabel}:`, `\tjumptext ${textLabel}`, "", marker, `${textLabel}:`, ...body, "",
  ]);
}

export function updateGbcSign(
  text: string, block: SignBlock, mode: SignMode, paragraphs: string[][],
  opts: { force: boolean; baselineHash?: string },
): string {
  const current = findGbcSign(text, block.scriptLabel);
  const baseline = block.marker?.hash ?? opts.baselineHash;
  if (!current.editable || (!opts.force && (baseline === undefined || signHash(current.body) !== baseline))) {
    throw new Error("hand-edited");
  }
  const unchanged = JSON.stringify(paragraphs) === JSON.stringify(current.paragraphs);
  const bodyLines = unchanged ? null : renderGbcBody(paragraphs);
  let updated = unchanged ? text : replaceLines(text, current.bodyStart, current.bodyEnd, bodyLines!);
  const fresh = findGbcSign(updated, block.scriptLabel);
  const labelLine = fresh.bodyStart - 1;
  const markerLine = labelLine - (fresh.marker ? 1 : 0);
  updated = replaceLines(updated, markerLine, labelLine, [formatMarker("gbc", mode, signHash(fresh.body))]);
  return updated;
}
