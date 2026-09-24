/**
 * RGBDS line-scanning primitives shared by every reader (and, from Task 4,
 * the writer) that walks `<keyword> <args>` macro-invocation lines: comment
 * stripping, MACRO...ENDM skipping, comma-splitting args, and (new in this
 * module) an offset-aware scanner for the splicer (`../write/asmSplice.ts`)
 * to locate exact byte spans to replace. One implementation of
 * comment-stripping and MACRO-skipping in the codebase -- `map.ts` imports
 * from here instead of keeping its own copies (Task 3 code-quality review).
 * `codeLines` is the ONE MACRO...ENDM skipper (Task 4 spec review Issue 1):
 * both `stripMacroDefs` (offset-discarding, for `map.ts`'s parsers) and
 * `scanCalls` (offset-preserving, for the splicer) are built on it, so they
 * can never independently drift on what counts as a macro body.
 */

/** Escapes a string for literal use inside a `RegExp` (macro/label names are plain identifiers, but this is cheap insurance). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips a trailing `; comment` (RGBDS comments never occur inside a value
 * in the files this module parses -- no string literals here, unlike
 * `incbin.ts`'s INCBIN paths). Cuts at the FIRST `;`: a comment's own text
 * may contain a second `;` (`; a ; b`), which must not be mistaken for
 * more code after it.
 */
export function stripComment(line: string): string {
  const i = line.indexOf(";");
  return i === -1 ? line : line.slice(0, i);
}

/** A line's own [start, end) content span, terminator excluded. Handles `\n`, `\r\n`, and a final line with no terminator at all -- including a lone trailing `\r` with no `\n` following it. */
function splitLines(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      let end = i;
      if (end > start && text[end - 1] === "\r") end--;
      out.push({ start, end });
      start = i + 1;
    }
  }
  return out;
}

/** One non-MACRO-body line, with its absolute span in the original text. */
export interface CodeLine {
  lineIndex: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Every file this module's callers parse opens with one or more
 * `MACRO ... ENDM` definitions, and at least one of those bodies
 * (attributes.asm's `connection` macro) contains a legacy recursive call
 * that looks exactly like a real invocation. This is the ONE place that
 * decides "is this line inside a macro body" -- every other MACRO/ENDM
 * check in this module (there is none) or `map.ts` goes through here.
 */
export function codeLines(text: string): CodeLine[] {
  const out: CodeLine[] = [];
  let inMacro = false;
  const lines = splitLines(text);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const { start, end } = lines[lineIndex]!;
    const line = text.slice(start, end);
    if (!inMacro && /^\s*MACRO\b/.test(line)) {
      inMacro = true;
      continue;
    }
    if (inMacro) {
      if (/^\s*ENDM\b/.test(line)) inMacro = false;
      continue;
    }
    out.push({ lineIndex, start, end, text: line });
  }
  return out;
}

/**
 * Drops every line between `MACRO` and `ENDM`, discarding offsets --
 * for callers that don't need them (`map.ts`'s parsers, which build fresh
 * records rather than splicing bytes back into the original text).
 * `scanCalls` below is the offset-preserving equivalent for the splicer.
 * Both are thin wrappers over `codeLines`, the one shared MACRO skipper.
 */
export function stripMacroDefs(text: string): string[] {
  return codeLines(text).map((l) => l.text);
}

/**
 * Comma-splits `rest` into trimmed argument strings/spans, absolute in the
 * original text (`rest` starts at `offset`). A `rest` that is entirely
 * whitespace (or empty) is zero arguments -- valid. Otherwise, a blank slot
 * between commas (`1,,3`) or after a trailing comma (`1,2,`) refuses rather
 * than silently dropping it and shifting every later argument's index (G4)
 * -- `splitArgs` and `scanCalls` share this one implementation.
 */
function splitArgsWithOffsets(rest: string, offset: number): AsmArg[] {
  if (rest.trim() === "") return [];
  const out: AsmArg[] = [];
  let partStart = 0;
  for (let i = 0; i <= rest.length; i++) {
    if (i === rest.length || rest[i] === ",") {
      const raw = rest.slice(partStart, i);
      if (raw.trim() === "") {
        throw new Error(`splitArgs: blank argument in "${rest.trim()}" -- a missing value between commas is not a valid argument list`);
      }
      const leadWs = raw.match(/^\s*/)![0]!.length;
      const trailWs = raw.match(/\s*$/)![0]!.length;
      const start = offset + partStart + leadWs;
      const end = offset + i - trailWs;
      out.push({ start, end, text: rest.slice(partStart + leadWs, i - trailWs) });
      partStart = i + 1;
    }
  }
  return out;
}

/** Comma-split, trimmed, comment-stripped -- args are expressions, never `\w+`. Refuses on a blank slot (see `splitArgsWithOffsets`). */
export function splitArgs(rest: string): string[] {
  return splitArgsWithOffsets(rest, 0).map((a) => a.text);
}

/** Matches a `<keyword> <args>` macro-invocation line and returns its comma-split args, or null. */
export function matchCall(line: string, keyword: string): string[] | null {
  const m = stripComment(line).match(new RegExp(`^\\s*${escapeRegExp(keyword)}\\s+(.*)$`));
  return m ? splitArgs(m[1]!) : null;
}

/**
 * `$xx` hex, or a signed decimal integer, and nothing else. Refuses (throws,
 * naming the offending text) rather than truncating -- plain `parseInt`
 * silently stops at the first non-digit (`parseInt("5 + 1")` is `5`,
 * `parseInt("4 ;  1")` is `4`), which would mask a malformed or unstripped
 * trailing token as a plausible number instead of surfacing it (G4).
 * Exported for direct unit testing of this refusal.
 *
 * Lives here (not `map.ts`, its original home) because it's a generic
 * RGBDS-numeric-literal primitive with no map-specific knowledge -- callers
 * outside `map.ts` (`tileset.ts`, `palette.ts`, `parseConstDefs` below) need
 * it too. `map.ts` re-exports it for its own existing importers.
 */
export function parseNum(s: string): number {
  const t = s.trim();
  if (/^\$[0-9A-Fa-f]+$/.test(t)) return parseInt(t.slice(1), 16);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  throw new Error(`parseNum: "${s}" is not a clean $hex or signed decimal number`);
}

const CONST_DEF_RE = /^\s*const_def\b\s*(.*)$/;
const CONST_RE = /^\s*const\b\s+([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * `const_def [N]` / `const NAME` sequences (RGBDS's enum idiom), as used for
 * e.g. both `TILESET_*` (`const_def 1`) and `PAL_BG_*` (bare `const_def`, so 0)
 * in `constants/tileset_constants.asm`, and the environment/palette/clock-time
 * enums `palette.ts` parses out of `constants/map_data_constants.asm` and
 * `constants/wram_constants.asm`. Each `const_def` resets the counter (to its
 * argument, or 0 with none); each `const NAME` assigns the current counter to
 * NAME and increments. One pass over the whole file handles any number of
 * such blocks, since names never collide across enums (callers that need to
 * isolate one specific block from a large multi-enum file, e.g. `palette.ts`'s
 * `extractConstDefBlockEndingAt`, do that isolation before calling this).
 *
 * Lives here (not `tileset.ts`, its original home) because it moved from a
 * single-domain enum parser (originally `TILESET_*`/`PAL_BG_*` only) to a
 * generic RGBDS-enum primitive shared across the tileset, environment,
 * palette, and clock-time domains -- `asm.ts` is where the other shared
 * RGBDS-line primitives (`codeLines`/`matchCall`/etc.) already live.
 */
export function parseConstDefs(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let counter = 0;
  for (const line of stripMacroDefs(text)) {
    const stripped = stripComment(line);
    const cd = stripped.match(CONST_DEF_RE);
    if (cd) {
      const arg = cd[1]!.trim();
      counter = arg === "" ? 0 : parseNum(arg);
      continue;
    }
    const c = stripped.match(CONST_RE);
    if (c) {
      out.set(c[1]!, counter);
      counter++;
    }
  }
  return out;
}

/** One argument's exact byte span in the scanned text, trimmed of surrounding whitespace; comment text is never included. */
export interface AsmArg {
  start: number;
  end: number;
  text: string;
}

/** One `<macro> <args>` invocation line found by `scanCalls`. */
export interface AsmCall {
  lineIndex: number;
  /** Offset of the line's first character (after any preceding line terminator). */
  lineStart: number;
  /** Offset one past the line's last content character -- excludes the `\r`/`\n` terminator, or is `text.length` for a final line with none. */
  lineEnd: number;
  args: AsmArg[];
}

/**
 * Finds every `<macro> <args>` invocation line in `text`, with each
 * argument's exact absolute byte span. Comments are excluded, lines inside
 * `MACRO ... ENDM` are skipped (via `codeLines`, the one shared skipper),
 * `\r\n` and a missing final newline are both accepted, and `macro` must
 * match as a whole token (`map` never matches `map_const`/`map_attributes`/
 * `map_id` -- enforced the same way as `matchCall`, by requiring whitespace
 * immediately after the keyword).
 */
export function scanCalls(text: string, macro: string): AsmCall[] {
  const out: AsmCall[] = [];
  const callRe = new RegExp(`^\\s*${escapeRegExp(macro)}\\s+(.*)$`);

  for (const { lineIndex, start: lineStart, end: lineEnd, text: lineText } of codeLines(text)) {
    const working = stripComment(lineText);
    const m = working.match(callRe);
    if (!m) continue;

    const restStart = working.length - m[1]!.length;
    const restOffset = lineStart + restStart;
    const rest = text.slice(restOffset, lineStart + working.length);

    out.push({ lineIndex, lineStart, lineEnd, args: splitArgsWithOffsets(rest, restOffset) });
  }

  return out;
}

/** A `Label:` or `Label::` line (optionally comment-tailed) that bounds a section. */
const LABEL_LINE_RE = /^[A-Za-z_][A-Za-z0-9_]*::?\s*(;.*)?$/m;

/**
 * The tail of `text` after a `Label:` line, bounded at the next label line
 * (or end of text) -- shared by `../write/asmSplice.ts`'s `locateEventCall`
 * (a `<mapName>_MapEvents:` section) and `../load/events.ts` (both
 * `<mapName>_MapEvents:` and `<mapName>_MapScripts:` sections), since both
 * rely on the same format fact: an RGBDS label's own section always runs to
 * the next label (GBC format findings §3.1). The label may carry trailing
 * whitespace (`CeruleanCave1F_MapEvents: `) -- matched up to the end of its
 * own line, never past it.
 */
export interface LabelTail {
  /** The bounded text after the label's own line. */
  text: string;
  /** Absolute offset of `text[0]` within the original `text` passed in. */
  offset: number;
  /** 0-based line index of `text`'s first line within the original text. */
  lineIndex: number;
}

/** Refuses (throws, naming the label) when `label:` is not found. */
export function labelTail(text: string, label: string): LabelTail {
  const labelLineRe = new RegExp(`^${escapeRegExp(label)}:[^\\n]*$`, "m");
  const labelMatch = labelLineRe.exec(text);
  if (!labelMatch) {
    throw new Error(`labelTail: no "${label}:" label found`);
  }

  const labelLineEnd = labelMatch.index + labelMatch[0].length;
  const nextNewline = text.indexOf("\n", labelLineEnd);
  const tailOffset = nextNewline === -1 ? text.length : nextNewline + 1;

  const tailText = text.slice(tailOffset);
  const nextLabelMatch = LABEL_LINE_RE.exec(tailText);
  const boundedTail = nextLabelMatch ? tailText.slice(0, nextLabelMatch.index) : tailText;

  const lineIndex = text.slice(0, tailOffset).match(/\n/g)?.length ?? 0;
  return { text: boundedTail, offset: tailOffset, lineIndex };
}
