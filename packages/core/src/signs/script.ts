export interface GenerateSignScriptOptions {
  /** Full label, e.g. "CeladonCity_EventScript_Poliwrath". Derived from
   *  mapName+species (this project's own "_EventScript_WildSign_<Species>"
   *  convention) when omitted. */
  scriptLabel?: string;
  textLabel?: string;
  /** Required when scriptLabel/textLabel are omitted. */
  mapName?: string;
  /** Bare species name, with or without the SPECIES_ prefix -- e.g. "POLIWRATH" or "SPECIES_POLIWRATH".
   *  Case-insensitive: normalized to uppercase before building the SPECIES_ constant. */
  species: string;
  /** Single line of message-box text. Must not contain '"' (would close the
   *  .string literal early), '$' (the .string terminator in this charmap,
   *  not a literal character), or a raw newline. */
  dialogue: string;
}

export interface GeneratedSignScript {
  scriptLabel: string;
  textLabel: string;
  script: string;
  text: string;
}

function titleCase(speciesBare: string): string {
  // NIDORAN_F -> NidoranF, MR_MIME -> MrMime -- each underscore-delimited
  // segment capitalized and concatenated with no separator, matching this
  // project's own derived-label convention (chosen here; the subject decomp's
  // OWN hand-written text labels are inconsistent across maps and are not a
  // convention this generator can derive from, per Task 16's own read of
  // CeladonCity_Text_MyTrustedPalPoliwrath vs. CeladonCity_Text_Poliwrath).
  return speciesBare.toLowerCase().split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
}

/**
 * Reproduces the exact shape of data/maps/CeladonCity/scripts.inc's
 * CeladonCity_EventScript_Poliwrath / CeladonCity_Text_Poliwrath pair (read
 * directly, see this task's own golden test) -- lock/faceplayer/waitse,
 * playmoncry the species, msgbox one line, waitmoncry, closemessage,
 * release, end. Pure string generation; nothing here touches a file --
 * Task 17's write.ts is the only thing that does.
 */
export function generateSignScript(opts: GenerateSignScriptOptions): GeneratedSignScript {
  if (!opts.dialogue.trim()) {
    throw new Error("generateSignScript: dialogue must not be empty -- a wild sign with no line is a silent NPC, pass real text");
  }
  if (opts.dialogue.includes('"')) {
    throw new Error('generateSignScript: dialogue must not contain a literal " -- it would close the .string literal early and produce invalid asm');
  }
  if (opts.dialogue.includes("$")) {
    throw new Error("generateSignScript: dialogue must not contain a literal $ -- in this charmap $ is the .string terminator, not a literal character, and would embed a premature end-of-string");
  }
  if (opts.dialogue.includes("\n")) {
    throw new Error("generateSignScript: dialogue must not contain a raw newline -- .string is single-line here, pass one line of text");
  }

  // Uppercase before stripping the prefix so a lowercase/mixed-case species
  // (e.g. from a future UI composer where a user types it) still produces a
  // correctly-cased SPECIES_ constant, never a non-compiling SPECIES_rattata.
  const speciesBare = opts.species.toUpperCase().replace(/^SPECIES_/, "");
  const speciesConst = `SPECIES_${speciesBare}`;

  let scriptLabel = opts.scriptLabel;
  let textLabel = opts.textLabel;
  if (!scriptLabel || !textLabel) {
    if (!opts.mapName) {
      throw new Error("generateSignScript: mapName is required when scriptLabel/textLabel are not both given explicitly");
    }
    const suffix = titleCase(speciesBare);
    scriptLabel ??= `${opts.mapName}_EventScript_WildSign_${suffix}`;
    textLabel ??= `${opts.mapName}_Text_WildSign_${suffix}`;
  }

  const script =
    `${scriptLabel}::\n` +
    `\tlock\n` +
    `\tfaceplayer\n` +
    `\twaitse\n` +
    `\tplaymoncry ${speciesConst}, CRY_MODE_NORMAL\n` +
    `\tmsgbox ${textLabel}, MSGBOX_DEFAULT\n` +
    `\twaitmoncry\n` +
    `\tclosemessage\n` +
    `\trelease\n` +
    `\tend\n`;

  const text = `${textLabel}:\n\t.string "${opts.dialogue}$"\n`;

  return { scriptLabel, textLabel, script, text };
}
