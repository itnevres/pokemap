/**
 * RGBDS line-scanning primitives shared by every reader (and, from Task 4,
 * the writer) that walks `<keyword> <args>` macro-invocation lines: comment
 * stripping, MACRO...ENDM skipping, comma-splitting args, and (new in this
 * module) an offset-aware scanner for the splicer (`../write/asmSplice.ts`)
 * to locate exact byte spans to replace. One implementation of
 * comment-stripping and MACRO-skipping in the codebase -- `map.ts` imports
 * from here instead of keeping its own copies (Task 3 code-quality review).
 */

/** Escapes a string for literal use inside a `RegExp` (macro/label names are plain identifiers, but this is cheap insurance). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips a trailing `; comment` (RGBDS comments never occur inside a value
 * in the files this module parses -- no string literals here, unlike
 * `incbin.ts`'s INCBIN paths).
 */
export function stripComment(line: string): string {
  const i = line.indexOf(";");
  return i === -1 ? line : line.slice(0, i);
}

/**
 * Every file this module's callers parse opens with one or more
 * `MACRO ... ENDM` definitions, and at least one of those bodies
 * (attributes.asm's `connection` macro) contains a legacy recursive call
 * that looks exactly like a real invocation. Drop every line between
 * `MACRO` and `ENDM` so callers never see it.
 *
 * Line-dropping loses offsets, so this helper is only for callers that
 * don't need them (`map.ts`'s parsers, which build fresh records rather
 * than splicing bytes back into the original text). `scanCalls` below is
 * the offset-preserving equivalent for the splicer.
 */
export function stripMacroDefs(text: string): string[] {
  const lines = text.split(/\r\n|\n/);
  const out: string[] = [];
  let inMacro = false;
  for (const line of lines) {
    if (!inMacro && /^\s*MACRO\b/.test(line)) {
      inMacro = true;
      continue;
    }
    if (inMacro) {
      if (/^\s*ENDM\b/.test(line)) inMacro = false;
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Comma-split, trimmed, comment-stripped -- args are expressions, never `\w+`. */
export function splitArgs(rest: string): string[] {
  return rest
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Matches a `<keyword> <args>` macro-invocation line and returns its comma-split args, or null. */
export function matchCall(line: string, keyword: string): string[] | null {
  const m = stripComment(line).match(new RegExp(`^\\s*${escapeRegExp(keyword)}\\s+(.*)$`));
  return m ? splitArgs(m[1]!) : null;
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

/** A line's own [start, end) content span, terminator excluded. Handles `\n`, `\r\n`, and a final line with no terminator at all. */
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

/**
 * Comma-splits `rest` (the text after `<macro>` and its separating
 * whitespace) into trimmed argument spans, absolute in the original text
 * (`rest` starts at `offset`). Mirrors `splitArgs`'s trim-and-drop-blanks
 * behavior, but keeps each argument's own [start, end) byte range instead
 * of discarding it -- what the splicer needs to replace exactly one
 * argument's bytes and nothing else (G3).
 */
function splitArgsWithOffsets(rest: string, offset: number): AsmArg[] {
  const out: AsmArg[] = [];
  let partStart = 0;
  for (let i = 0; i <= rest.length; i++) {
    if (i === rest.length || rest[i] === ",") {
      const raw = rest.slice(partStart, i);
      if (raw.trim() !== "") {
        const leadWs = raw.match(/^\s*/)![0]!.length;
        const trailWs = raw.match(/\s*$/)![0]!.length;
        const start = offset + partStart + leadWs;
        const end = offset + i - trailWs;
        out.push({ start, end, text: rest.slice(partStart + leadWs, i - trailWs) });
      }
      partStart = i + 1;
    }
  }
  return out;
}

/**
 * Finds every `<macro> <args>` invocation line in `text`, with each
 * argument's exact absolute byte span. Comments are excluded, lines inside
 * `MACRO ... ENDM` are skipped, `\r\n` and a missing final newline are both
 * accepted, and `macro` must match as a whole token (`map` never matches
 * `map_const`/`map_attributes`/`map_id` -- enforced the same way as
 * `matchCall`, by requiring whitespace immediately after the keyword).
 */
export function scanCalls(text: string, macro: string): AsmCall[] {
  const out: AsmCall[] = [];
  const callRe = new RegExp(`^\\s*${escapeRegExp(macro)}\\s+(.*)$`);
  let inMacro = false;

  const lines = splitLines(text);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const { start: lineStart, end: lineEnd } = lines[lineIndex]!;
    const lineText = text.slice(lineStart, lineEnd);

    if (!inMacro && /^\s*MACRO\b/.test(lineText)) {
      inMacro = true;
      continue;
    }
    if (inMacro) {
      if (/^\s*ENDM\b/.test(lineText)) inMacro = false;
      continue;
    }

    const commentIdx = lineText.indexOf(";");
    const working = commentIdx === -1 ? lineText : lineText.slice(0, commentIdx);
    const m = working.match(callRe);
    if (!m) continue;

    const restStart = working.length - m[1]!.length;
    const restOffset = lineStart + restStart;
    const rest = text.slice(restOffset, lineStart + working.length);

    out.push({ lineIndex, lineStart, lineEnd, args: splitArgsWithOffsets(rest, restOffset) });
  }

  return out;
}
