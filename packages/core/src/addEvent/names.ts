/**
 * Extracts all defined names (labels, constants, equates, defines) from source text.
 * Pure function, no I/O.
 */

/** Comment characters to strip per family. */
const COMMENT_RE = {
  gba: /[@/].*/g,
  gbc: /;.*/g,
};

/** GBA label: Name: or Name:: at line start (leading whitespace allowed). */
const GBA_LABEL_RE = /^[ \t]*([A-Za-z_]\w*)::?/gm;

/** GBA .set Name, / .equ Name, */
const GBA_DOT_SET_EQU_RE = /^\s*\.(?:set|equ)\s+([A-Za-z_]\w*)\s*,/gmi;

/** GBA #define Name (also #  define) */
const GBA_DEFINE_RE = /^#\s*define\s+([A-Za-z_]\w*)/gmi;

/** GBC label: Name: or Name:: at line start. */
const GBC_LABEL_RE = /^[ \t]*([A-Za-z_]\w*)::?/gm;

/** GBC const Name */
const GBC_CONST_RE = /^\s*const\s+([A-Za-z_]\w*)/gmi;

/** GBC DEF Name EQU/EQUS/= */
const GBC_DEF_RE = /^\s*DEF\s+([A-Za-z_]\w*)\s+(?:EQU|EQUS|=)/gmi;

/** GBC Name EQU / Name EQUS (no DEF prefix) */
const GBC_EQU_RE = /^[ \t]*([A-Za-z_]\w*)\s+(?:EQU|EQUS)\b/gmi;

/**
 * Strips comments from text for the given family.
 */
function stripComments(text: string, family: "gba" | "gbc"): string {
  return text.replace(COMMENT_RE[family], "");
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