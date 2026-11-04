import { AddEventRefusal, type CopyPreview, type RefusalCode } from "./types.js";

/** A string literal, honouring backslash escapes such as `\"`. */
export const GBA_STRING = /"(?:[^"\\\r\n]|\\.)*"/g;
// `@` starts a comment only outside a string literal.
function gbaCode(line: string): string {
  return line.replace(new RegExp(`${GBA_STRING.source}|@.*$`, "g"), value => value.startsWith("@") ? "" : value).trim();
}
const GBA_LABEL = /^([A-Za-z_]\w*)::?\s*(.*)$/;
// GBA has no local labels, so the body ends at the next label of any kind.
const TERMINAL = /^(?:end|return|goto\s+[A-Za-z_]\w*)$/;
const DIALOGUE = new RegExp(`^\\.string\\s+${GBA_STRING.source}$`);
// cpp runs over scripts.inc: conditionals are live code, but a directive that defines, removes or pulls in names is not.
const DEFINING_DIRECTIVE = /^#\s*(?!(?:if|ifdef|ifndef|elif|else|endif)\b)/;

/** Top-level label declarations of a scripts.inc, as indexes into its lines. */
function declarations(lines: string[]): { index: number; name: string; inline: string }[] {
  return lines.flatMap((line, index) => {
    const m = GBA_LABEL.exec(line);
    return m ? [{ index, name: m[1]!, inline: m[2]! }] : [];
  });
}

/** Copies one event script from this map's scripts.inc, with the dialogue labels it references. */
export function copyGbaScriptBody(scriptsInc: string, label: string): CopyPreview {
  const map = /^(\w+)_MapScripts::?/m.exec(scriptsInc)?.[1] ?? label.replace(/_.*$/, "");
  const path = `data/maps/${map}/scripts.inc`;
  const fail = (code: RefusalCode, why: string): never => {
    throw new AddEventRefusal(code, `${map}: ${path}: ${label}: ${why}`, path);
  };
  const raw = scriptsInc.split(/\r?\n/);
  const lines = raw.map(gbaCode);
  const decls = declarations(lines);
  const scopeOf = (name: string) => {
    const defs = decls.filter(d => d.name === name);
    if (defs.length !== 1) return undefined;
    const def = defs[0]!;
    const next = decls.find(d => d.index > def.index);
    const commands = [def.inline, ...lines.slice(def.index + 1, next?.index)].filter(Boolean);
    return { def, next, commands, rawBody: [def.inline ? `\t${def.inline}` : "", ...raw.slice(def.index + 1, next?.index)] };
  };
  const scope = scopeOf(label);
  if (!scope) return fail("COPY_NOT_SCRIPT", "label is not defined exactly once in this map");
  const { commands } = scope;
  if (commands.some(c => /^\./.test(c) || /^(?:map_script(?:_2)?|step_end)\b/.test(c))) {
    fail("COPY_NOT_SCRIPT", "label is data, movement or text, not an event script");
  }
  if (commands.some(c => DEFINING_DIRECTIVE.test(c))) fail("COPY_NOT_SCRIPT", "script contains a non-conditional # directive");
  // gas treats `;` as a statement separator, which could hide a label or directive mid-line.
  if (commands.some(c => c.replace(GBA_STRING, "").includes(";"))) fail("COPY_NOT_SCRIPT", "script contains a ; statement separator");
  if (!commands.length || !TERMINAL.test(commands.at(-1)!)) {
    fail(scope.next ? "COPY_FALLTHROUGH" : "COPY_UNBOUNDED", "script has no final terminator before the next label or end of file");
  }
  const texts: Record<string, string> = {};
  for (const command of commands) {
    for (const ref of command.replace(GBA_STRING, "").matchAll(/[A-Za-z_]\w*/g)) {
      const target = ref[0];
      if (target === label || target in texts) continue;
      const t = scopeOf(target);
      if (!t || !t.commands.length || !t.commands.every(c => DIALOGUE.test(c))) continue;
      if (!/\$"$/.test(t.commands.at(-1)!) || t.commands.slice(0, -1).some(c => /\$"$/.test(c))) {
        fail("COPY_NOT_SCRIPT", `text ${target} is not a bounded dialogue block`);
      }
      texts[target] = t.rawBody.filter((l, i) => i !== 0 || l !== "").join("\n").trimEnd() + "\n";
    }
  }
  const body = scope.rawBody.filter((l, i) => i !== 0 || l !== "").join("\n").trimEnd() + "\n";
  return { label, body, texts };
}
