import { codeLines } from "../gbc/load/asm.js";
import { AddEventRefusal, type CopyPreview } from "./types.js";

// Quotes matter: a semicolon in dialogue is not an assembler comment.
function code(line: string): string {
  return line.replace(/"[^"\r\n]*"|;.*$/g, value => value.startsWith(";") ? "" : value).trim();
}
const LABEL = /^([A-Za-z_][\w]*|\.[A-Za-z_]\w*)::?\s*(.*)$/;
const TERMINAL = /^(?:(?:end|return|endcallback)\s*$|(?:sjump|jumptext|jumptextfaceplayer|jumpopenedtext)\s+[A-Za-z_.][\w.]*\s*$)/;
const DATA = /^(?:itemball|hiddenitem|trainer|conditional_event|text|line|cont|para|done|prompt|db|dw|dl|ds|def_\w+)\b/;

/** Copies one top-level script scope, including its local branches and same-file dialogue. */
export function copyGbcScriptBody(text: string, label: string): CopyPreview {
  const map = /^(\w+)_Map(?:Scripts|Events):/m.exec(text)?.[1] ?? label.replace(/Pokemap.*$/, "");
  const path = `maps/${map}.asm`;
  const fail = (code: ConstructorParameters<typeof AddEventRefusal>[0], why: string): never => {
    throw new AddEventRefusal(code, `${map}: ${path}: ${label}: ${why}`, path);
  };
  const lines = codeLines(text).map(l => ({ ...l, code: code(l.text) }));
  const declarations = lines.map((l, index) => ({ index, match: LABEL.exec(l.code) }))
    .filter(d => d.match && !d.match[1]!.startsWith("."));
  const matches = declarations.filter(d => d.match![1] === label);
  if (matches.length !== 1) fail("COPY_NOT_SCRIPT", "label is not defined exactly once in this map");
  const start = matches[0]!.index;
  const next = declarations.find(d => d.index > start)?.index;
  const scope = lines.slice(start + 1, next);
  const inline = LABEL.exec(lines[start]!.code)![2]!;
  const commands = [inline, ...scope.map(l => l.code.replace(/^\.[A-Za-z_]\w*::?\s*/, ""))].filter(Boolean);
  if (!commands.length || DATA.test(commands[0]!)) fail("COPY_NOT_SCRIPT", "label is data or text, not an event script");
  if (commands.some(c => DATA.test(c) || /^(?:MACRO|ENDM|SECTION|INCLUDE|INCBIN|DEF|REPT|ENDR|IF|ELSE|ENDC)\b/.test(c))) {
    fail("COPY_NOT_SCRIPT", "unsupported data or assembler directive in script");
  }
  // Inspect the final branch, not just the first terminator: earlier branches can end before a local label.
  if (!TERMINAL.test(commands.at(-1)!)) fail(next === undefined ? "COPY_UNBOUNDED" : "COPY_FALLTHROUGH", "script has no final terminator before the next label or end of file");
  const locals = new Set(scope.flatMap(l => { const m = LABEL.exec(l.code); return m?.[1]?.startsWith(".") ? [m[1]] : []; }));
  for (const command of commands) {
    const bare = command.replace(/"[^"\r\n]*"/g, "");
    for (const ref of bare.matchAll(/(?:[A-Za-z_]\w*)?\.[A-Za-z_]\w*/g)) {
      const local = ref[0].startsWith(`${label}.`) ? ref[0].slice(label.length) : ref[0];
      if (!locals.has(local)) fail("COPY_FOREIGN_LOCAL", `local target ${ref[0]} is outside this script`);
    }
  }
  const texts: Record<string, string> = {};
  for (const command of commands) {
    const m = /^(?:jumptextfaceplayer|jumptext|jumpopenedtext|writetext)\s+([A-Za-z_]\w*)$/.exec(command);
    if (!m) continue;
    const target = m[1]!;
    const defs = declarations.filter(d => d.match![1] === target);
    if (defs.length !== 1) fail("COPY_NOT_SCRIPT", `text ${target} is not defined in this map`);
    const def = defs[0]!;
    const end = declarations.find(d => d.index > def.index)?.index;
    const raw = lines.slice(def.index + 1, end);
    const textCommands = [def.match![2]!, ...raw.map(l => l.code)].filter(Boolean);
    if (!/^(?:done|prompt)$/.test(textCommands.at(-1) ?? "") ||
      !/^text\s+"[^"\r\n]*"$/.test(textCommands[0] ?? "") ||
      textCommands.slice(0, -1).some(c => !/^(?:text|line|cont|para)\s+"[^"\r\n]*"$/.test(c))) {
      fail("COPY_NOT_SCRIPT", `text ${target} is not a bounded dialogue block`);
    }
    texts[target] = [def.match![2]!, ...raw.map(l => l.text)].filter((l, i) => i !== 0 || l !== "").join("\n").trimEnd() + "\n";
  }
  const rawBody = [inline ? `\t${inline}` : "", ...scope.map(l => l.text)].filter((l, i) => i !== 0 || l !== "");
  return { label, body: rawBody.join("\n").trimEnd() + "\n", texts };
}
