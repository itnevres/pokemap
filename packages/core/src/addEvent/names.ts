/**
 * Extracts all defined names (labels, constants, equates, defines) from source text.
 * Pure function, no I/O.
 */

/** GBA label: Name: or Name:: at line start (leading whitespace allowed). */
const GBA_LABEL_RE = /^[ \t]*([A-Za-z_]\w*)::?/gm;

/** GBA .set Name, / .equ Name, */
const GBA_DOT_SET_EQU_RE = /^\s*\.(?:set|equ)\s+([A-Za-z_]\w*)\s*,/gmi;

/** GBA #define Name (also #  define) - accepts leading whitespace before # */
const GBA_DEFINE_RE = /^[ \t]*#\s*define\s+([A-Za-z_]\w*)/gmi;

/** GBC label: Name: or Name:: at line start. */
const GBC_LABEL_RE = /^[ \t]*([A-Za-z_]\w*)::?/gm;

/** GBC const Name */
const GBC_CONST_RE = /^\s*const\s+([A-Za-z_]\w*)/gmi;

/** GBC DEF Name EQU/EQUS/= */
const GBC_DEF_RE = /^\s*DEF\s+([A-Za-z_]\w*)\s+(?:EQU|EQUS|=)/gmi;

/** GBC Name EQU / Name EQUS (no DEF prefix) */
const GBC_EQU_RE = /^[ \t]*([A-Za-z_]\w*)\s+(?:EQU|EQUS)\b/gmi;

/**
 * Strips comments from GBA text.
 * Handles:
 *   - Block comments (multi-line, keeps newlines so line starts stay line starts)
 *   - // to end of line
 *   - @ to end of line ONLY outside double-quoted strings (GAS @ comments)
 */
function stripGbaComments(text: string): string {
  let result = "";
  let i = 0;
  const len = text.length;
  let inBlockComment = false;
  let inString = false;
  let stringChar = "";

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        // Keep newlines so line starts stay line starts
        if (ch === "\n") result += "\n";
        i++;
      }
      continue;
    }

    if (inString) {
      result += ch;
      if (ch === stringChar && (i === 0 || text[i - 1] !== "\\")) {
        inString = false;
      }
      i++;
      continue;
    }

    // Not in comment or string
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "/" && next === "/") {
      // Skip to end of line
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    if (ch === "@") {
      // @ comment only outside strings - skip to end of line
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Strips comments from GBC text.
 * Handles ; to end of line (outside strings, though GBC asm rarely uses strings in const context).
 */
function stripGbcComments(text: string): string {
  let result = "";
  let i = 0;
  const len = text.length;
  let inString = false;
  let stringChar = "";

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      result += ch;
      if (ch === stringChar && (i === 0 || text[i - 1] !== "\\")) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === ";") {
      // Skip to end of line
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
    }

    result += ch;
    i++;
  }

  return result;
}

function stripComments(text: string, family: "gba" | "gbc"): string {
  return family === "gba" ? stripGbaComments(text) : stripGbcComments(text);
}

/**
 * Extracts names from text for the given family.
 * Local labels (starting with .) are excluded.
 */
function extractNames(text: string, family: "gba" | "gbc", regexes: RegExp[]): Set<string> {
  const names = new Set<string>();
  const cleaned = stripComments(text, family);
  for (const re of regexes) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(cleaned)) !== null) {
      const name = match[1];
      if (name && !name.startsWith(".")) {
        names.add(name);
      }
    }
  }
  return names;
}

export function definedNames(text: string, family: "gba" | "gbc"): Set<string> {
  if (family === "gba") {
    return extractNames(text, "gba", [GBA_LABEL_RE, GBA_DOT_SET_EQU_RE, GBA_DEFINE_RE]);
  } else {
    return extractNames(text, "gbc", [GBC_LABEL_RE, GBC_CONST_RE, GBC_DEF_RE, GBC_EQU_RE]);
  }
}