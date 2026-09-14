export type JsonPath = (string | number)[];
export interface JsonEdit { path: JsonPath; value: unknown; }

interface Span { start: number; end: number; }

/**
 * Invariant I2. This module never calls JSON.stringify on a whole document.
 * It locates each target value's source span and splices a new literal in.
 *
 * Consequences, all of them deliberate:
 *   - keys PokeMap has never heard of survive untouched
 *   - keys that were absent stay absent
 *   - key order, indentation and line endings are preserved
 *   - an unchanged document is returned byte-identical
 */
export function editJson(src: string, edits: JsonEdit[]): string {
  if (edits.length === 0) return src;

  const spans = edits.map((e) => ({ span: locate(src, e.path), value: e.value }));
  // Apply right-to-left so earlier offsets stay valid.
  spans.sort((a, b) => b.span.start - a.span.start);

  let out = src;
  for (const { span, value } of spans) {
    out = out.slice(0, span.start) + JSON.stringify(value) + out.slice(span.end);
  }
  return out;
}

/** Find the source span of the value at `path`, throwing if any step is absent. */
export function locate(src: string, path: JsonPath): Span {
  let cursor = skipWs(src, 0);
  for (const step of path) {
    cursor = typeof step === "number" ? enterIndex(src, cursor, step) : enterKey(src, cursor, step);
  }
  return { start: cursor, end: valueEnd(src, cursor) };
}

const WS = new Set([" ", "\t", "\r", "\n"]);
const skipWs = (s: string, i: number): number => { while (i < s.length && WS.has(s[i]!)) i++; return i; };

function readString(s: string, i: number): { value: string; end: number } {
  let out = "";
  i++; // opening quote
  while (i < s.length && s[i] !== '"') {
    if (s[i] === "\\") { out += s[i]! + s[i + 1]!; i += 2; }
    else out += s[i++]!;
  }
  return { value: JSON.parse(`"${out}"`) as string, end: i + 1 };
}

/** End offset (exclusive) of the JSON value starting at `i`. */
export function valueEnd(s: string, i: number): number {
  const c = s[i];
  if (c === '"') return readString(s, i).end;
  if (c === "{" || c === "[") {
    // Both closers decrement, on one shared depth. An earlier draft tracked
    // `close = c === "{" ? "}" : "]"` and tested `ch === "}" || ch === close`,
    // which for an object is `"}" || "}"` -- so `]` never decremented and any
    // object containing an array ran off the end and threw "unterminated
    // container". `{"encounter_rate":20,"mons":[...]}` is exactly that shape and
    // is what wild_encounters.json is made of, so Task 26 would have hit it.
    // JSON is well formed by the time we are here, so one depth counter across
    // both bracket kinds is correct and the `close` variable is unnecessary.
    let depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') { i = readString(s, i).end; continue; }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    throw new Error("unterminated container");
  }
  while (i < s.length && !WS.has(s[i]!) && s[i] !== "," && s[i] !== "}" && s[i] !== "]") i++;
  return i;
}

function enterKey(s: string, objStart: number, key: string): number {
  if (s[objStart] !== "{") throw new Error(`expected an object at offset ${objStart}`);
  let i = skipWs(s, objStart + 1);
  while (i < s.length && s[i] !== "}") {
    const k = readString(s, i);
    i = skipWs(s, k.end);
    if (s[i] !== ":") throw new Error(`malformed object at offset ${i}`);
    const valueStart = skipWs(s, i + 1);
    if (k.value === key) return valueStart;
    i = skipWs(s, valueEnd(s, valueStart));
    if (s[i] === ",") i = skipWs(s, i + 1);
  }
  throw new Error(`key "${key}" is absent; adding keys is an explicit operation, never a side effect of saving`);
}

function enterIndex(s: string, arrStart: number, index: number): number {
  if (s[arrStart] !== "[") throw new Error(`expected an array at offset ${arrStart}`);
  let i = skipWs(s, arrStart + 1);
  for (let n = 0; i < s.length && s[i] !== "]"; n++) {
    if (n === index) return i;
    i = skipWs(s, valueEnd(s, i));
    if (s[i] === ",") i = skipWs(s, i + 1);
  }
  throw new Error(`index ${index} is not present`);
}

/**
 * Adding a key is refused everywhere in this file (`enterKey`'s own
 * message) -- adding an ARRAY ELEMENT is different: it never introduces a
 * key nobody named, it appends/inserts a whole new sibling in a place the
 * schema already expects a list of them (object_events, warp_events, ...).
 * So it gets its own explicit, named operation instead of being folded into
 * `editJson`'s scalar-replace semantics.
 *
 * Never invents formatting. Every byte of indentation/comma style around
 * the new element is COPIED from a real neighbour already in the file
 * (empty array: no neighbour exists, so the new element sits with no
 * padding at all, matching this file's own "[value]" convention for that
 * case) -- never re-derived from a rule this project would have to keep in
 * sync with whatever the real files' own formatting is.
 */
export function insertArrayElement(src: string, path: JsonPath, index: number, value: unknown): string {
  const arr = locate(src, path);
  if (src[arr.start] !== "[") throw new Error(`expected an array at ${JSON.stringify(path)}`);

  const { elements, leadingGaps } = walkArray(src, arr.start);
  if (index < 0 || index > elements.length) {
    throw new Error(`insert index ${index} is out of range for an array of ${elements.length} element(s)`);
  }

  const literal = JSON.stringify(value);

  if (elements.length === 0) {
    return src.slice(0, arr.start + 1) + literal + src.slice(arr.start + 1);
  }

  if (index === elements.length) {
    // Append: reuse the gap that currently precedes the CURRENT last
    // element as the separator style between it and the new one -- for a
    // single-element array there is no inter-element pair to copy, so the
    // array's own lead-in gap (leadingGaps[0], identical in practice under
    // consistent indentation) stands in.
    const gap = leadingGaps[elements.length - 1]!;
    const lastEnd = elements[elements.length - 1]!.end;
    return src.slice(0, lastEnd) + "," + gap + literal + src.slice(lastEnd);
  }

  // Insert before an existing element: splice `literal + "," + <the gap
  // that already precedes it>` directly at its own start. The gap that
  // used to precede it now precedes the NEW element instead (unchanged,
  // untouched bytes); a fresh copy of the identical gap text separates the
  // new element from the old one that follows it.
  const gap = leadingGaps[index]!;
  const at = elements[index]!.start;
  return src.slice(0, at) + literal + "," + gap + src.slice(at);
}

/** The exact inverse of insertArrayElement at the same index. */
export function removeArrayElement(src: string, path: JsonPath, index: number): string {
  const arr = locate(src, path);
  if (src[arr.start] !== "[") throw new Error(`expected an array at ${JSON.stringify(path)}`);

  const { elements } = walkArray(src, arr.start);
  if (index < 0 || index >= elements.length) throw new Error(`index ${index} is not present`);

  if (elements.length === 1) {
    // Not `arr.start + 1` / `arr.end - 1`: an array that was ORIGINALLY
    // empty can still have interior bytes between `[` and `]` (Porymap
    // renders a genuinely empty object_events as `[\n\n  ]`, not `[]`).
    // Slicing at the element's own span reproduces whatever surrounded it
    // -- collapsing to a bare `[]` only when there truly was nothing else
    // there -- which is what makes this the exact inverse of
    // insertArrayElement's empty-array branch (that branch splices the
    // literal in right after `[`, leaving any such interior bytes as this
    // element's own trailing content).
    return src.slice(0, elements[0]!.start) + src.slice(elements[0]!.end);
  }

  if (index === 0) {
    // No comma PRECEDES the first element -- remove it plus the comma and
    // gap that follow it instead (the one leading into the new first
    // element), which is the exact inverse of insertArrayElement's own
    // index-0 splice.
    return src.slice(0, elements[0]!.start) + src.slice(elements[1]!.start);
  }

  return src.slice(0, elements[index - 1]!.end) + src.slice(elements[index]!.end);
}

interface ArrayWalk { elements: Span[]; leadingGaps: string[]; }

/**
 * Walks every element of the array starting at `arrStart` (the position of
 * `[`), recording each element's own [start,end) span AND the raw gap text
 * immediately preceding it -- `leadingGaps[0]` is the array's own lead-in
 * (between `[` and the first element, never a comma), `leadingGaps[k]` for
 * k>=1 is the whitespace AFTER the comma that precedes element k (the comma
 * character itself is consumed separately, never included in a gap
 * string). One more entry than `elements.length` is NOT produced -- the
 * trailing gap before `]` is discarded (nothing needs to reuse it: removal
 * only ever excises up to an element's own `.end`, and insertion never
 * splices after the last element's trailing gap, only right after its
 * `.end` and before that gap).
 *
 * Assumes this project's own real formatting: a comma immediately follows
 * its value with no space before it (confirmed across every real map.json
 * this file's own corpus gate walks). A value whose start character is not
 * a recognised JSON value start (after whitespace-skipping) throws rather
 * than silently mis-parsing a stray character as a zero-length element --
 * the failure mode a space-before-comma file would otherwise hit.
 */
function walkArray(src: string, arrStart: number): ArrayWalk {
  const elements: Span[] = [];
  const leadingGaps: string[] = [];
  const VALUE_START = /["{\[\-0-9tfn]/;

  let cursor = arrStart + 1;
  while (true) {
    const elemStart = skipWs(src, cursor);
    if (src[elemStart] === "]") { leadingGaps.push(src.slice(cursor, elemStart)); break; }
    if (!VALUE_START.test(src[elemStart] ?? "")) {
      throw new Error(`malformed array element (unsupported formatting) at offset ${elemStart}`);
    }
    const elemEnd = valueEnd(src, elemStart);
    leadingGaps.push(src.slice(cursor, elemStart));
    elements.push({ start: elemStart, end: elemEnd });
    cursor = src[elemEnd] === "," ? elemEnd + 1 : elemEnd;
  }

  return { elements, leadingGaps };
}
