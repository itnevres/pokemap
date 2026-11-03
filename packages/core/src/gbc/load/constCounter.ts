import { codeLines, stripComment, parseNum } from "./asm.js";

/** Line numbers are zero-based, matching codeLines and event splicing. */
export function constCounter(text: string): { name: string; value: number; line: number }[] {
  const out: { name: string; value: number; line: number }[] = [];
  let value = 0;
  for (const l of codeLines(text)) {
    const s = stripComment(l.text).trim();
    const command = /^(const_def|const_next|const_skip)\b\s*(.*)$/.exec(s);
    if (command) {
      const [, op, arg] = command;
      const n = arg ? parseNum(arg) : op === "const_skip" ? 1 : 0;
      if (op === "const_skip") value += n;
      else value = n;
    } else {
      const c = /^const\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
      if (c) out.push({ name: c[1]!, value: value++, line: l.lineIndex });
    }
  }
  return out;
}

export function gbcEventGap(text: string): { afterLine: number; remaining: number } | null {
  const last = constCounter(text).filter(c => c.name.startsWith("EVENT_")).at(-1);
  if (!last) return null;
  const next = codeLines(text).find(l => l.lineIndex > last.line && /^\s*const_next\b/.test(stripComment(l.text)));
  if (!next) return null;
  const boundary = parseNum(stripComment(next.text).trim().replace(/^const_next\s+/, ""));
  const remaining = boundary - last.value - 1;
  return remaining > 0 ? { afterLine: last.line, remaining } : null;
}
