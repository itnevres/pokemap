import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { codeLines, stripComment } from "../gbc/load/asm.js";

export interface SymbolIndex { labels: Set<string>; constants: Set<string> }

function files(root: string, accept: (path: string) => boolean, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...files(root, accept, path));
    else if (entry.isFile() && accept(path)) out.push(path);
  }
  return out;
}

export function buildGbaSymbolIndex(root: string): SymbolIndex {
  const idx: SymbolIndex = { labels: new Set(), constants: new Set() };
  for (const file of files(root, (p) => /^data\/.*\.inc$/.test(p) || /^data\/[^/]+\.s$/.test(p) || /^include\/constants\/[^/]+\.h$/.test(p))) {
    const text = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
    if (file.endsWith(".h")) {
      for (const m of text.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)/gm)) idx.constants.add(m[1]!);
    } else {
      // ponytail: text scan only; macro-generated labels are outside this index's ceiling.
      for (const m of text.matchAll(/^([A-Za-z_]\w*)::?/gm)) idx.labels.add(m[1]!);
    }
  }
  return idx;
}

export function buildGbcSymbolIndex(root: string): SymbolIndex {
  const idx: SymbolIndex = { labels: new Set(), constants: new Set() };
  for (const file of files(root, (p) => p.endsWith(".asm"))) {
    let scope = "";
    for (const line of codeLines(readFileSync(join(root, file), "utf8"))) {
      const text = stripComment(line.text);
      const label = /^([A-Za-z_][\w.]*|\.[A-Za-z_]\w*)::?/.exec(text);
      if (label) {
        const name = label[1]!;
        if (name.startsWith(".")) idx.labels.add(scope + name);
        else {
          if (!name.includes(".")) scope = name;
          idx.labels.add(name);
        }
      }
      const constant = /^\s*(?:DEF\s+([A-Za-z_]\w*)\b|([A-Za-z_]\w*)\s+(?:EQU|SET|=)\s|(?:const|const_skip_name|map_const)\s+([A-Za-z_]\w*)\b)/.exec(text);
      if (constant) idx.constants.add((constant[1] ?? constant[2] ?? constant[3])!);
    }
  }
  return idx;
}

/** Numeric tokens are removed before identifiers, so e.g. 0xFF never asks for xFF. */
export function resolvesAll(expr: string, idx: SymbolIndex): boolean {
  const identifiers = expr.replace(/\b0x[\da-f]+\b|\b0b[01]+\b|\$[\da-f]+\b|%[01]+\b|\b\d+\b/gi, " ")
    .match(/[A-Za-z_][\w.]*/g) ?? [];
  return identifiers.every((name) => idx.labels.has(name) || idx.constants.has(name));
}
