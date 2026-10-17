import { replaceLines } from "../gbc/write/asmSplice.js";
import { formatMarker, parseMarker, signHash, type SignBlock, type SignMode } from "./marker.js";

function code(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === "@" && !quoted) return line.slice(0, i).trim();
  }
  return line.trim();
}

const labelPattern = /^[A-Za-z_][\w.]*::?$/;

export function findGbaSign(incText: string, scriptLabel: string): SignBlock {
  const raw = incText.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const lines = raw.map(code);
  const block: SignBlock = {
    scriptLabel, textLabel: null, editable: false, reason: null, marker: null,
    bodyStart: 0, bodyEnd: 0, body: "", paragraphs: [],
  };
  const refuse = (reason: string): SignBlock => ({ ...block, reason });
  const scripts = lines.flatMap((line, i) => line === `${scriptLabel}::` ? [i] : []);
  if (scripts.length !== 1) return refuse("script is not a single msgbox sign");
  const script = scripts[0]!;
  const nextLabel = lines.findIndex((line, i) => i > script && labelPattern.test(line));
  const commands = lines.slice(script + 1, nextLabel < 0 ? undefined : nextLabel).filter(Boolean);
  const msgbox = commands.length === 2 && commands[1] === "end"
    ? /^msgbox\s+([A-Za-z_][\w.]*),\s*MSGBOX_SIGN$/.exec(commands[0]!) : null;
  if (!msgbox) return refuse("script is not a single msgbox sign");
  const textLabel = msgbox[1]!;
  block.textLabel = textLabel;
  const labels = lines.flatMap((line, i) => line === `${textLabel}:` ? [i] : []);
  if (labels.length !== 1) return refuse("text label not found in this file");
  const label = labels[0]!;
  const ownMsgbox = lines.findIndex((line, i) => i > script && line === commands[0]);
  const word = new RegExp(`\\b${textLabel.replace(/\./g, "\\.")}\\b`);
  if (raw.some((line, i) => i !== label && i !== ownMsgbox && word.test(line))) return refuse("shared text");
  block.marker = parseMarker(raw[label - 1] ?? "");
  block.bodyStart = label + 1;
  let value = "";
  for (let i = block.bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    if (labelPattern.test(line)) break;
    const string = /^\.string\s+"([^"\r\n]*)"$/.exec(line);
    if (!string) return refuse(`unsupported text command ${line.split(/\s/)[0]}`);
    const part = string[1]!;
    if (/\\(?![nlp])/.test(part) || (part.includes("$") && !/^[^$]*\$$/.test(part))) {
      return refuse("unsupported text command .string");
    }
    value += part;
    if (!part.endsWith("$")) continue;
    block.paragraphs = value.slice(0, -1).split("\\p").map((paragraph) => paragraph.split(/\\[nl]/));
    block.bodyEnd = i + 1;
    block.body = raw.slice(block.bodyStart, block.bodyEnd).join("");
    block.editable = true;
    return block;
  }
  return refuse("unsupported text command missing terminator");
}

export function renderGbaBody(paragraphs: string[][]): string[] {
  if (!paragraphs.length || paragraphs.some((p) => !p.length)) throw new Error("sign text must contain a nonempty paragraph");
  return paragraphs.flatMap((paragraph, p) => paragraph.map((line, i) => {
    if (/["$\\\r\n]/.test(line)) throw new Error("unsupported sign text character");
    const suffix = i === paragraph.length - 1 ? (p === paragraphs.length - 1 ? "$" : "\\p") : i === 0 ? "\\n" : "\\l";
    return `\t.string "${line}${suffix}"`;
  }));
}

function signLabels(mapName: string, n: number) {
  if (!/^[A-Za-z_][\w]*$/.test(mapName) || !Number.isSafeInteger(n) || n < 1) throw new Error("invalid sign label");
  return { script: `${mapName}_EventScript_PokemapSign${n}`, text: `${mapName}_Text_PokemapSign${n}` };
}

export function gbaSignScript(mapName: string, n: number): string[] {
  const labels = signLabels(mapName, n);
  return [`${labels.script}::`, `\tmsgbox ${labels.text}, MSGBOX_SIGN`, "\tend"];
}

export function gbaSignText(mapName: string, n: number, mode: SignMode, paragraphs: string[][]): string[] {
  const labels = signLabels(mapName, n);
  const body = renderGbaBody(paragraphs);
  return [formatMarker("gba", mode, signHash(body.join("\n") + "\n")), `${labels.text}:`, ...body];
}

export function nextGbaSignNumber(incText: string, mapName: string): number {
  const labels = new Set(incText.split(/\r?\n/).map(code));
  let n = 1;
  for (;;) {
    const names = signLabels(mapName, n);
    if (![names.script, names.text].some((label) => labels.has(`${label}:`) || labels.has(`${label}::`))) return n;
    n++;
  }
}

export function updateGbaSign(
  incText: string, block: SignBlock, mode: SignMode, paragraphs: string[][],
  opts: { force: boolean; baselineHash?: string },
): string {
  const current = findGbaSign(incText, block.scriptLabel);
  const baseline = current.marker?.hash ?? opts.baselineHash;
  if (!current.editable || (!opts.force && (baseline === undefined || signHash(current.body) !== baseline))) throw new Error("hand-edited");
  const unchanged = JSON.stringify(paragraphs) === JSON.stringify(current.paragraphs);
  const updated = unchanged ? incText : replaceLines(incText, current.bodyStart, current.bodyEnd, renderGbaBody(paragraphs));
  const fresh = findGbaSign(updated, block.scriptLabel);
  const labelLine = fresh.bodyStart - 1;
  return replaceLines(updated, labelLine - (fresh.marker ? 1 : 0), labelLine, [formatMarker("gba", mode, signHash(fresh.body))]);
}
