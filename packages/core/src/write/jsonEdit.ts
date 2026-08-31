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
