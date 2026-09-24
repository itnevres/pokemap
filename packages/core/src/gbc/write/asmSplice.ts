/**
 * Line-anchored surgical splices onto RGBDS assembly source (roadmap G3):
 * replace only the bytes of one macro argument, every other byte untouched.
 * Never parse-and-regenerate a file -- `spliceArg` slices around the exact
 * span `scanCalls` (`../load/asm.ts`) already found. This is Plan 6's own
 * minimal primitive; multi-arg/multi-line/insert/remove ops are Plan 7 scope.
 */
import { scanCalls, escapeRegExp, type AsmCall } from "../load/asm.js";

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

/** A bare `Label:` or `Label::` line (optionally comment-tailed), the same shape `map.ts`'s own label lines use. Never matches an indented macro-invocation line, since those never end in `:`. */
const LABEL_LINE_RE = /^[A-Za-z_][A-Za-z0-9_]*::?\s*(;.*)?$/m;

/**
 * The `ordinal`-th (0-based) `<macro> ...` call after `<mapName>_MapEvents:`
 * in a `maps/<Name>.asm` file's text (the event block is always the file's
 * tail, per the format findings). The label may carry trailing whitespace
 * (`CeruleanCave1F_MapEvents: `) -- matched up to the end of its own line,
 * never past it. Bounded at the next label line, if any, so a call
 * belonging to a different map's section is never mistaken for this one's
 * (never observed in the real corpus -- every `_MapEvents:` is the file's
 * own tail -- but this function must not assume its caller always passes
 * one isolated map's text). Refuses, naming what's missing, when the label
 * is absent or the ordinal is out of range.
 */
export function locateEventCall(text: string, mapName: string, macro: string, ordinal: number): AsmCall {
  const label = `${mapName}_MapEvents`;
  const labelLineRe = new RegExp(`^${escapeRegExp(label)}:[^\\n]*$`, "m");
  const labelMatch = labelLineRe.exec(text);
  if (!labelMatch) {
    throw new Error(`locateEventCall: no "${label}:" label found`);
  }

  const labelLineEnd = labelMatch.index + labelMatch[0].length;
  const nextNewline = text.indexOf("\n", labelLineEnd);
  const tailOffset = nextNewline === -1 ? text.length : nextNewline + 1;

  const tailText = text.slice(tailOffset);
  const nextLabelMatch = LABEL_LINE_RE.exec(tailText);
  const boundedTail = nextLabelMatch ? tailText.slice(0, nextLabelMatch.index) : tailText;

  const matches = scanCalls(boundedTail, macro);
  if (ordinal < 0 || ordinal >= matches.length) {
    throw new Error(`locateEventCall: ordinal ${ordinal} is out of range for ${matches.length} "${macro}" call(s) after "${label}:"`);
  }

  const linesBeforeTail = text.slice(0, tailOffset).match(/\n/g)?.length ?? 0;
  const call = matches[ordinal]!;
  return {
    lineIndex: call.lineIndex + linesBeforeTail,
    lineStart: call.lineStart + tailOffset,
    lineEnd: call.lineEnd + tailOffset,
    args: call.args.map((a) => ({ start: a.start + tailOffset, end: a.end + tailOffset, text: a.text })),
  };
}
