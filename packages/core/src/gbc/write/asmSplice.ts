/**
 * Line-anchored surgical splices onto RGBDS assembly source (roadmap G3):
 * replace only the bytes of one macro argument, every other byte untouched.
 * Never parse-and-regenerate a file -- `spliceArg` slices around the exact
 * span `scanCalls` (`../load/asm.ts`) already found. This is Plan 6's own
 * minimal primitive; multi-arg/multi-line/insert/remove ops are Plan 7 scope.
 */
import { scanCalls, labelTail, type AsmCall } from "../load/asm.js";

const STRUCTURAL_CHARS = /[,;\r\n]/;

/**
 * Replaces exactly `text.slice(arg.start, arg.end)` (the `argIndex`-th
 * argument of `call`) with `value`. Refuses rather than guess (G4) when:
 * `argIndex` is out of range; `value` is empty or has leading/trailing
 * whitespace or contains `,`/`;`/a newline (any of which would change the
 * line's own structure, not just one value); or `call`'s recorded arg text
 * no longer matches `text` at its own offsets (a stale call -- offsets
 * captured against a different or already-edited text).
 */
export function spliceArg(text: string, call: AsmCall, argIndex: number, value: string): string {
  if (argIndex < 0 || argIndex >= call.args.length) {
    throw new Error(`spliceArg: argument index ${argIndex} is out of range for a call with ${call.args.length} argument(s)`);
  }
  if (value === "") {
    throw new Error("spliceArg: replacement value must not be empty");
  }
  if (value.trim() !== value) {
    throw new Error(`spliceArg: replacement value "${value}" must not have leading/trailing whitespace (would change the line's structure)`);
  }
  if (STRUCTURAL_CHARS.test(value)) {
    throw new Error(`spliceArg: replacement value "${value}" must not contain ",", ";", or a newline (would change the line's structure)`);
  }

  const arg = call.args[argIndex]!;
  const actual = text.slice(arg.start, arg.end);
  if (actual !== arg.text) {
    throw new Error(
      `spliceArg: stale call -- expected "${arg.text}" at offset [${arg.start}, ${arg.end}), found "${actual}"; re-scan before splicing`,
    );
  }

  return text.slice(0, arg.start) + value + text.slice(arg.end);
}

/** The unique `<macro> ...` call whose first argument equals `firstArg` (e.g. `locateCall(text, "map_attributes", "NewBarkTown")`). Refuses, naming the target, on 0 or >1 matches. */
export function locateCall(text: string, macro: string, firstArg: string): AsmCall {
  const matches = scanCalls(text, macro).filter((c) => c.args[0]?.text === firstArg);
  if (matches.length === 0) {
    throw new Error(`locateCall: no "${macro}" call has first argument "${firstArg}"`);
  }
  if (matches.length > 1) {
    throw new Error(`locateCall: ${matches.length} "${macro}" calls have first argument "${firstArg}", expected exactly 1`);
  }
  return matches[0]!;
}

/** The `ordinal`-th (0-based) `<macro> ...` call in `text`, in source order (e.g. a `tilecoll` line). Refuses, naming the ordinal, when it is out of range. */
export function locateNthCall(text: string, macro: string, ordinal: number): AsmCall {
  const matches = scanCalls(text, macro);
  if (ordinal < 0 || ordinal >= matches.length) {
    throw new Error(`locateNthCall: ordinal ${ordinal} is out of range for ${matches.length} "${macro}" call(s)`);
  }
  return matches[ordinal]!;
}

/**
 * Every `<macro> ...` call after `<mapName>_MapEvents:` in a `maps/<Name>.asm`
 * file's text (the event block is always the file's tail, per the format
 * findings), absolute offsets, source order. Section-bounding (label lookup,
 * trailing whitespace tolerance, next-label cutoff) is `../load/asm.ts`'s
 * `labelTail` -- the one place that decides "this label's section ends here",
 * shared with `../load/events.ts`. Refuses, naming what's missing, when the
 * label is absent.
 */
export function locateEventCalls(text: string, mapName: string, macro: string): AsmCall[] {
  let tail;
  try {
    tail = labelTail(text, `${mapName}_MapEvents`);
  } catch (e) {
    throw new Error(`locateEventCall: ${(e as Error).message}`);
  }
  return scanCalls(tail.text, macro).map((call) => ({
    lineIndex: call.lineIndex + tail.lineIndex,
    lineStart: call.lineStart + tail.offset,
    lineEnd: call.lineEnd + tail.offset,
    args: call.args.map((a) => ({ start: a.start + tail.offset, end: a.end + tail.offset, text: a.text })),
  }));
}

/** The `ordinal`-th (0-based) `<macro> ...` call after `<mapName>_MapEvents:` (see `locateEventCalls`). Refuses when the label is absent or the ordinal is out of range. */
export function locateEventCall(text: string, mapName: string, macro: string, ordinal: number): AsmCall {
  const matches = locateEventCalls(text, mapName, macro);
  if (ordinal < 0 || ordinal >= matches.length) {
    throw new Error(`locateEventCall: ordinal ${ordinal} is out of range for ${matches.length} "${macro}" call(s) after "${mapName}_MapEvents:"`);
  }
  return matches[ordinal]!;
}

/**
 * The terminator starting at `text[i]` (CRLF or LF); "" when `i` is the end of
 * text; null when `i` is mid-line. A lone CR is NOT a terminator: `codeLines`
 * (the line model every locator is built on) splits only on LF / CRLF, so
 * accepting one here would splice into what the locators see as one line.
 */
function terminatorAt(text: string, i: number): string | null {
  if (i === text.length) return "";
  if (text.startsWith("\r\n", i)) return "\r\n";
  if (text[i] === "\n") return "\n";
  return null;
}

/**
 * CRLF when `text` contains one, else LF (the corpus is all LF; CRLF is supported anyway).
 * ponytail: "any CRLF means CRLF" -- a mixed-EOL file gets CRLF on inserted lines. Upgrade: reuse the anchor line's own terminator.
 */
function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Inserts `line` as a new line immediately after the line whose content ends
 * at `lineEnd`. A last line with no final newline stays the last line with no
 * final newline (`text + eol + line`), byte-exact, so a file's lack of one is
 * preserved. Refuses when `lineEnd` is not at a line end or `line` contains a
 * line break.
 */
export function insertLineAfter(text: string, lineEnd: number, line: string): string {
  if (/[\r\n]/.test(line)) {
    throw new Error("insertLineAfter: the inserted line must not contain a line break");
  }
  const term = Number.isInteger(lineEnd) && lineEnd >= 0 && lineEnd <= text.length ? terminatorAt(text, lineEnd) : null;
  if (term === null) {
    throw new Error(`insertLineAfter: offset ${lineEnd} is not at the end of a line`);
  }
  const eol = eolOf(text);
  if (term === "") return text + eol + line;
  const at = lineEnd + term.length;
  return text.slice(0, at) + line + eol + text.slice(at);
}

/**
 * Removes the line spanning [lineStart, lineEnd) together with exactly one
 * terminator: its own, or -- for a last line with no final newline -- the
 * preceding one, so the file still has no final newline. Exact inverse of
 * `insertLineAfter`. Refuses when the span is not exactly one whole line.
 */
export function removeLine(text: string, lineStart: number, lineEnd: number): string {
  const startOk = Number.isInteger(lineStart) && lineStart >= 0 && (lineStart === 0 || text[lineStart - 1] === "\n");
  const term = startOk && Number.isInteger(lineEnd) && lineEnd >= lineStart && lineEnd <= text.length ? terminatorAt(text, lineEnd) : null;
  if (term === null || /[\r\n]/.test(text.slice(lineStart, lineEnd))) {
    throw new Error(`removeLine: [${lineStart}, ${lineEnd}) is not exactly one whole line`);
  }
  if (term !== "") return text.slice(0, lineStart) + text.slice(lineEnd + term.length);
  if (lineStart === 0) return "";
  const prevEol = text.startsWith("\r\n", lineStart - 2) ? 2 : 1;
  return text.slice(0, lineStart - prevEol) + text.slice(lineEnd);
}

/** Replaces whole 0-based lines, retaining untouched bytes and final-newline state. */
export function replaceLines(text: string, startLine: number, endLineExclusive: number, lines: string[]): string {
  const chunks = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (!Number.isInteger(startLine) || !Number.isInteger(endLineExclusive) ||
      startLine < 0 || endLineExclusive < startLine || endLineExclusive > chunks.length) {
    throw new Error("replaceLines: invalid line range");
  }
  if (lines.some((line) => /[\r\n]/.test(line))) {
    throw new Error("replaceLines: replacement lines must not contain line breaks");
  }
  if (startLine === endLineExclusive && lines.length === 0) return text;
  const eol = text.match(/\r?\n/)?.[0] ?? "\n";
  const finalNewline = text.endsWith("\n");
  let prefix = chunks.slice(0, startLine).join("");
  const suffix = chunks.slice(endLineExclusive).join("");
  let replacement = lines.join(eol);
  if (lines.length > 0) {
    if (prefix && !prefix.endsWith("\n")) prefix += eol;
    if (suffix || finalNewline) replacement += eol;
  } else if (!suffix && !finalNewline) {
    prefix = prefix.replace(/\r?\n$/, "");
  }
  return prefix + replacement + suffix;
}
