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
  "<NULL>",
  "<SCROLL>",
]);

// Token width overrides for GBC
const GBC_TOKEN_WIDTHS: Record<string, number> = {
  "<PLAYER>": 7,
  "<RIVAL>": 7,
  "<PLAY_G>": 7,
  "<POKE>": 2,
  "<PKMN>": 2,
  "<TM>": 2,
  "<TRAINER>": 7,
  "<ROCKET>": 6,
};

// Disallowed tokens for GBA (two-character sequences and "$")
const GBA_DISALLOWED_TOKENS = new Set(["$", "\\n", "\\l", "\\p"]);

// Parse a GBA quoted string, handling '\'' -> ' and \\ -> \, but keeping other backslash sequences intact
function parseQuotedString(s: string): string {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === "\\" && i + 1 < s.length) {
      const next = s.charAt(i + 1);
      if (next === "'") {
        result += "'";
        i++;
      } else if (next === "\\") {
        result += "\\";
        i++;
      } else {
        // keep both backslash and the following character
        result += c + next;
        i++;
      }
    } else {
      result += c;
    }
  }
  return result;
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
    if (token === undefined) continue;
    if (GBC_CONTROL_TOKENS.has(token)) continue;
    const width = GBC_TOKEN_WIDTHS[token] ?? 1;
    tokenWidths.set(token, width);
  }
  if (tokenWidths.size === 0) {
    throw new Error("gbc charmap has no entries");
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

    // Match line: either a quoted character or a bare token, then '=', then hex bytes
    const m = /^('(?:\\.|[^'\\])+'|\S+)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const left = m[1];
    let right = m[2];
    if (left === undefined || right === undefined) continue;
    right = right.trim();

    // Parse left side
    let token: string;
    if (left.startsWith("'")) {
      // Quoted character
      if (!left.endsWith("'")) continue; // invalid, skip
      const inner = left.slice(1, -1);
      token = parseQuotedString(inner);
      // Disallowed characters are skipped entirely
      if (GBA_DISALLOWED_TOKENS.has(token)) continue;
    } else {
      // Named token
      token = `{${left}}`;
    }

    // Parse right side (space-separated hex bytes)
    const bytes = right.split(/\s+/).filter(b => b.length > 0).map(b => b.toUpperCase());
    if (bytes.length === 0) continue;

    const firstByte = bytes[0];
    if (firstByte === undefined) continue;

    // Determine if this is a user token
    if (left.startsWith("'")) {
      // Quoted characters are always user tokens (unless disallowed, already handled)
      // Width = number of bytes (usually 1)
      tokenWidths.set(token, bytes.length);
    } else {
      // Named token: skip non-user tokens
      if (firstByte === "FC") continue; // control sequences
      if (bytes.length === 1 && firstByte === "FD") continue; // bare FD (e.g., STRING)
      // User token
      let width: number;
      if (bytes.length === 2 && firstByte === "FD") {
        // ponytail: conservative max name length; STR_VAR/B_* can be longer at runtime; upgrade = per-placeholder max table
        width = 7;
      } else {
        width = bytes.length;
      }
      tokenWidths.set(token, width);
    }
  }
  if (tokenWidths.size === 0) {
    throw new Error("gba charmap has no entries");
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
    const c = line.charAt(i);
    if (c === '"') {
      return { refusal: `Character "${c}" is not in the charmap.` };
    }
    if (cm.family === "gbc" && c === "<") {
      const start = i;
      while (i < n && line.charAt(i) !== ">") i++;
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
      while (i < n && line.charAt(i) !== "}") i++;
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
