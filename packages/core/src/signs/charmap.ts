export interface Charmap {
  family: "gba" | "gbc";
  has(token: string): boolean;
  widthOf(token: string): number;
}

// Control tokens not allowed in user text (GBC)
const GBC_CONTROL_TOKENS = new Set([
  "@",
  "<LF>",
  "<PARA>",
  "<LINE>",
  "<CONT>",
  "<DONE>",
  "<PROMPT>",
]);

// Token width overrides for GBC
const GBC_TOKEN_WIDTHS: Record<string, number> = {
  "<PLAYER>": 7,
  "<RIVAL>": 7,
  "<PKMN>": 2,
};

// Disallowed characters for GBA
const GBA_DISALLOWED_CHARS = new Set(["$", "\n", "\l", "\p"]);

function unescapeQuoted(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

export function parseGbcCharmap(text: string): Charmap {
  const tokenWidths = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    const m = /^\s*charmap\s+"([^"]+)",\s+\$[0-9A-Fa-f]+(?:\s+\$[0-9A-Fa-f]+)*/.exec(trimmed);
    if (!m) continue;
    const token = m[1];
    if (GBC_CONTROL_TOKENS.has(token)) continue;
    let width: number;
    if (GBC_TOKEN_WIDTHS[token] !== undefined) {
      width = GBC_TOKEN_WIDTHS[token];
    } else if (token.length === 1) {
      width = 1;
    } else if (token.startsWith("<") && token.endsWith(">")) {
      width = 1;
    } else {
      width = 1;
    }
    tokenWidths.set(token, width);
  }
  return {
    family: "gbc",
    has: (t) => tokenWidths.has(t),
    widthOf: (t) => {
      const w = tokenWidths.get(t);
      if (w === undefined) throw new Error(`Token not in charmap: ${t}`);
      return w;
    },
  };
}

export function parseGbaCharmap(text: string): Charmap {
  const tokenWidths = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const left = trimmed.substring(0, eqIndex).trim();
    if (left.startsWith("'")) {
      const inner = left.slice(1, -1);
      const char = unescapeQuoted(inner);
      if (GBA_DISALLOWED_CHARS.has(char)) continue;
      tokenWidths.set(char, 1);
    } else {
      const name = left;
      const token = `{${name}}`;
      if (token === "{PLAYER}" || token === "{RIVAL}") {
        tokenWidths.set(token, 7);
      } else {
        tokenWidths.set(token, 1);
      }
    }
  }
  return {
    family: "gba",
    has: (t) => tokenWidths.has(t),
    widthOf: (t) => {
      const w = tokenWidths.get(t);
      if (w === undefined) throw new Error(`Token not in charmap: ${t}`);
      return w;
    },
  };
}

export function tokenize(
  line: string,
  cm: Charmap
): { tokens: string[] } | { refusal: string } {
  const tokens: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === '"') {
      return { refusal: `Character "${c}" is not in the charmap.` };
    }
    if (cm.family === "gbc" && c === "<") {
      const start = i;
      while (i < n && line[i] !== ">") i++;
      if (i >= n) {
        const token = line.substring(start);
        return { refusal: `Unknown token ${token}.` };
      }
      i++;
      const token = line.substring(start, i);
      if (!cm.has(token)) {
        return { refusal: `Unknown token ${token}.` };
      }
      tokens.push(token);
    } else if (cm.family === "gba" && c === "{") {
      const start = i;
      while (i < n && line[i] !== "}") i++;
      if (i >= n) {
        const token = line.substring(start);
        return { refusal: `Unknown token ${token}.` };
      }
      i++;
      const token = line.substring(start, i);
      if (!cm.has(token)) {
        return { refusal: `Unknown token ${token}.` };
      }
      tokens.push(token);
    } else {
      if (!cm.has(c)) {
        return { refusal: `Character "${c}" is not in the charmap.` };
      }
      tokens.push(c);
      i++;
    }
  }
  return { tokens };
}
