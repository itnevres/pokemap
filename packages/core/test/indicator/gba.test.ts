import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGbaIndicator, findGbaIndicator, updateGbaIndicator, gbaIndicatorGraphics, guardGbaIndicatorWrite } from "../../src/indicator/gba.js";
import { wrapSign, SIGN_WIDTH } from "../../src/signs/wrap.js";
import { applyScriptAppend } from "../../src/write/save.js";

const input = { x: 5, y: 7, elevation: 0, species: "POLIWRATH", paragraphs: [["POLIWRATH: Ribi ribit!"]] };
const build = (species: string, paragraphs: string[][]) => buildGbaIndicator("Route101", "", [], { ...input, species, paragraphs });
const event = (script: string, species = "POLIWRATH") => ({ script, graphics_id: gbaIndicatorGraphics(species) });
const fixture = (name: string) => readFileSync(new URL(`../fixtures/indicator/${name}`, import.meta.url), "utf8");

// Golden fixture: the EXACT text of data/maps/CeladonCity/scripts.inc lines
// 57-66 (script) and 184-185 (text) in the subject decomp, byte-for-byte,
// including tabs (not spaces) and the double-colon/single-colon label
// convention. Read the real file yourself before touching this test if it
// ever needs to change -- do not hand-edit the fixture from memory.
const GOLDEN_SCRIPT =
  "CeladonCity_EventScript_Poliwrath::\n" +
  "\tlock\n" +
  "\tfaceplayer\n" +
  "\twaitse\n" +
  "\tplaymoncry SPECIES_POLIWRATH, CRY_MODE_NORMAL\n" +
  "\tmsgbox CeladonCity_Text_Poliwrath, MSGBOX_DEFAULT\n" +
  "\twaitmoncry\n" +
  "\tclosemessage\n" +
  "\trelease\n" +
  "\tend\n";

const GOLDEN_TEXT =
  "CeladonCity_Text_Poliwrath:\n" +
  '\t.string "POLIWRATH: Ribi ribit!$"\n';

describe("GBA Indicator", () => {
  it("preserves the real CeladonCity golden pair as an editable legacy Indicator", () => {
    const text = GOLDEN_SCRIPT + "\n" + GOLDEN_TEXT;
    expect(findGbaIndicator(text, event("CeladonCity_EventScript_Poliwrath"))).toMatchObject({ editable: true, species: "POLIWRATH", text: "POLIWRATH: Ribi ribit!" });
  });

  it("place golden", () => {
    const out = buildGbaIndicator("Route101", "", [], { x: 5, y: 7, elevation: 0, species: "ZIGZAGOON", paragraphs: [["Zig!"]] });
    expect(out.scriptLabel).toBe("Route101_EventScript_PokemonIndicator1");
    expect(out.textLabel).toBe("Route101_Text_PokemonIndicator1");
    expect(out.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(ZIGZAGOON)");
    expect(out.scriptAppendText).toBe(fixture("gba-place.inc"));
  });

  it("numbers labels independently of species and reserves text labels and mapScripts references", () => {
    const first = build("RATTATA", [["..."]]);
    expect(first.scriptLabel).toBe("Route101_EventScript_PokemonIndicator1");
    expect(first.scriptAppendText.startsWith(first.scriptLabel + "::\n")).toBe(true);
    const second = buildGbaIndicator("Route101", first.scriptAppendText, [], { ...input, species: "RATTATA" });
    expect(second.scriptLabel).toBe("Route101_EventScript_PokemonIndicator2");
    expect(buildGbaIndicator("Route101", first.scriptAppendText, [second.scriptLabel], input).scriptLabel).toBe("Route101_EventScript_PokemonIndicator3");
    expect(buildGbaIndicator("Route101", "Route101_Text_PokemonIndicator1:\n", [], input).scriptLabel).toBe(second.scriptLabel);
    expect(buildGbaIndicator("Route101", first.scriptAppendText, ["Route101_EventScript_PokemonIndicator3"], input).scriptLabel).toBe(second.scriptLabel);
    expect(build("NIDORAN_F", [["..."]]).scriptLabel).toBe(first.scriptLabel);
    expect(build("MR__MIME", [["..."]]).objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(MR__MIME)");
  });

  it.each([
    ["comment-only mention", "@ Route101_EventScript_PokemonIndicator1\n", []],
    ["quoted mention", '.string "Route101_Text_PokemonIndicator1"\n', []],
    ["mapScripts comment", "", ["@ Route101_EventScript_PokemonIndicator1"]],
    ["mapScripts quoted mention", "", ['.string "Route101_EventScript_PokemonIndicator1"']],
  ] as const)("ignores %s when allocating the lowest unused label", (_name, incText, scripts) => {
    const out = buildGbaIndicator("Route101", incText, [...scripts], input);
    expect(out.scriptLabel).toBe("Route101_EventScript_PokemonIndicator1");
  });

  it("reserves real mapScripts references after quoted strings containing @", () => {
    const out = buildGbaIndicator("Route101", '@ Route101_EventScript_PokemonIndicator2\n', [
      'some_macro "@ Route101_EventScript_PokemonIndicator2", Route101_EventScript_PokemonIndicator1 @ keep',
    ], input);
    expect(out.scriptLabel).toBe("Route101_EventScript_PokemonIndicator2");
  });

  it.each([
    ["LF with final newline", "\n", true],
    ["LF without final newline", "\n", false],
    ["CRLF with final newline", "\r\n", true],
    ["CRLF without final newline", "\r\n", false],
  ] as const)("preserves EOL style and final-newline state when appending to %s", (_name, eol, finalNewline) => {
    const before = ["Existing::", "\tend"].join(eol) + (finalNewline ? eol : "");
    const out = buildGbaIndicator("Route101", before, [], input);
    const after = applyScriptAppend(before, { path: "data/maps/Route101/scripts.inc", text: out.scriptAppendText });
    expect(out.scriptAppendText.endsWith("\n")).toBe(finalNewline);
    expect(after.endsWith("\n")).toBe(before.endsWith("\n"));
    expect(after.match(/\r?\n/g)).toEqual(expect.arrayContaining([eol]));
    expect(after.match(/\r?\n/g)?.every(ending => ending === eol)).toBe(true);
    expect(after.startsWith(before)).toBe(true);
  });

  it.each([
    ["extra indentation", '\t\t.string "Hello$"'],
    ["inline comment", '\t.string "Hello$" @ keep'],
    ["standalone comment", '@ keep\n\t.string "Hello$"'],
    ["trailing whitespace", '\t.string "Hello$" '],
    ["blank body line", '\n\t.string "Hello$"'],
  ])("refuses text layout changed outside PokeMap: %s", (_name, body) => {
    const out = build("POLIWRATH", [["Hello"]]);
    const changed = out.scriptAppendText.replace('\t.string "Hello$"', body);
    const block = findGbaIndicator(changed, event(out.scriptLabel));
    expect(block).toMatchObject({ editable: false, reason: "text layout changed outside PokeMap" });
    expect(() => updateGbaIndicator(changed, block!, "POLIWRATH", [["New"]])).toThrow("text layout changed outside PokeMap");
  });

  it("rejects empty text and illegal literal characters", () => {
    expect(() => build("RATTATA", [])).toThrow(/empty|nonempty/i);
    expect(() => build("RATTATA", [[""]])).toThrow(/empty|nonempty/i);
    for (const text of ['RATTATA: "Skreee!"', "RATTATA: five bucks? $5!"]) {
      expect(() => build("RATTATA", [[text]])).toThrow(/character/i);
    }
  });

  it("wraps 60 characters into multiple string lines and round trips paragraphs", () => {
    const text = "small words ".repeat(5).trim() + "!";
    expect(text).toHaveLength(60);
    const wrapped = wrapSign(text + "\n\nLast.", { family: "gba", has: () => true, widthOf: () => 1 }, SIGN_WIDTH);
    if ("refusal" in wrapped) throw new Error(wrapped.refusal);
    const out = build("POLIWRATH", wrapped.paragraphs);
    expect(out.scriptAppendText).toContain('\\n"');
    expect(out.scriptAppendText).toContain('\\l"');
    expect(out.scriptAppendText).toContain('\\p"');
    expect(findGbaIndicator(out.scriptAppendText, event(out.scriptLabel))?.text).toBe(wrapped.paragraphs.map(p => p.join("\n")).join("\n\n"));
  });

  it("updates both fields when the text precedes the script, preserving comments and no final newline", () => {
    const out = build("POLIWRATH", [["Hello"]]);
    const [script, text] = out.scriptAppendText.split("\n\n");
    const before = text!.replace(/\n$/, "") + "\n\n" + script!.replace("CRY_MODE_NORMAL", "CRY_MODE_NORMAL @ keep this comment");
    const block = findGbaIndicator(before, event(out.scriptLabel))!;
    expect(updateGbaIndicator(before, block, "ODDISH", [["New", "text"]])).toBe(before.replace("SPECIES_POLIWRATH", "SPECIES_ODDISH").replace('\t.string "Hello$"', '\t.string "New\\n"\n\t.string "text$"'));
  });

  it("normalizes mixed case and SPECIES_ prefixes for cry and graphics", () => {
    for (const species of ["Rattata", "SPECIES_RATTATA", "species_rattata"]) {
      const out = build(species, [["..."]]);
      expect(out.scriptAppendText).toContain("playmoncry SPECIES_RATTATA, CRY_MODE_NORMAL");
      expect(out.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(RATTATA)");
    }
  });

  it("recognises generated and old WildSign blocks", () => {
    const out = build("POLIWRATH", [["POLIWRATH: Ribi ribit!"]]);
    for (const [text, label] of [[out.scriptAppendText, out.scriptLabel], [fixture("gba-legacy.inc"), "Route101_EventScript_WildSign_Poliwrath"]]) {
      expect(findGbaIndicator(text!, event(label!))).toMatchObject({ editable: true, species: "POLIWRATH", text: "POLIWRATH: Ribi ribit!" });
    }
  });

  it("refuses modified shapes, shared text and mismatched graphics", () => {
    const out = build("POLIWRATH", [["Hello"]]);
    for (const text of [out.scriptAppendText.replace("\tend\n", "\tsetflag FLAG_TEST\n\tend\n"), out.scriptAppendText.replace("\tlock", "\tlockall"), out.scriptAppendText + "\t.string \"extra$\"\n"]) {
      expect(findGbaIndicator(text, event(out.scriptLabel))).toMatchObject({ editable: false, reason: expect.any(String) });
    }
    expect(findGbaIndicator(out.scriptAppendText + `Other::\n\tmsgbox ${out.textLabel}, MSGBOX_DEFAULT\n\tend\n`, event(out.scriptLabel))).toMatchObject({ editable: false, reason: expect.stringContaining("shared text") });
    expect(findGbaIndicator(out.scriptAppendText, event(out.scriptLabel, "ODDISH"))).toMatchObject({ editable: false, reason: expect.any(String) });
    expect(findGbaIndicator("Other::\n\tend\n", event("Other"))).toBeNull();
  });

  it.each(["\n", "\r\n"])("updates only cry or text, keeps labels and unrelated bytes, and is idempotent (%j)", (eol) => {
    const out = build("POLIWRATH", [["Hello"]]);
    const before = ("@ before\n" + out.scriptAppendText + "\nOther::\n\tend\n").replace(/\n/g, eol);
    const block = findGbaIndicator(before, event(out.scriptLabel))!;
    expect(updateGbaIndicator(before, block, "POLIWRATH", [["Hello"]])).toBe(before);
    expect(updateGbaIndicator(before, block, "ODDISH", [["Hello"]])).toBe(before.replace("SPECIES_POLIWRATH", "SPECIES_ODDISH"));
    expect(updateGbaIndicator(before, block, "POLIWRATH", [["New", "text"], ["End"]])).toBe(before.replace('\t.string "Hello$"', ['\t.string "New\\n"', '\t.string "text\\p"', '\t.string "End$"'].join(eol)));
    expect(() => updateGbaIndicator(before.replace("\tlock", "\tlockall"), block, "ODDISH", [["Hello"]])).toThrow();
  });
});

describe("buildGbaIndicator", () => {
  it("builds a raw object_events value matching the real map.json field shape, and a scripts.inc append matching buildGbaIndicator's own output", () => {
    const result = buildGbaIndicator("Route101", "", [], { x: 5, y: 6, elevation: 3, species: "RATTATA", paragraphs: [["RATTATA: Skreee!"]] });
    expect(result.objectEvent).toEqual({
      graphics_id: "OBJ_EVENT_GFX_SPECIES(RATTATA)",
      x: 5, y: 6, elevation: 3,
      movement_type: "MOVEMENT_TYPE_FACE_DOWN",
      movement_range_x: 1, movement_range_y: 1,
      trainer_type: "TRAINER_TYPE_NONE",
      trainer_sight_or_berry_tree_id: "0",
      script: "Route101_EventScript_PokemonIndicator1",
      flag: "0",
    });
    expect(result.scriptLabel).toBe("Route101_EventScript_PokemonIndicator1");
    expect(result.scriptAppendText).toContain("playmoncry SPECIES_RATTATA, CRY_MODE_NORMAL");
    expect(result.scriptAppendText).toContain('.string "RATTATA: Skreee!$"');
  });

  it("accepts a species already carrying the SPECIES_ prefix without double-prefixing", () => {
    const result = buildGbaIndicator("Route101", "", [], { x: 0, y: 0, elevation: 0, species: "SPECIES_RATTATA", paragraphs: [["..."]] });
    expect(result.objectEvent.graphics_id).toBe("OBJ_EVENT_GFX_SPECIES(RATTATA)");
  });

  it("propagates buildGbaIndicator's own empty-text refusal rather than swallowing it", () => {
    expect(() => buildGbaIndicator("Route101", "", [], { x: 0, y: 0, elevation: 0, species: "RATTATA", paragraphs: [] })).toThrow(/empty|nonempty/i);
  });
});

describe("guardGbaIndicatorWrite", () => {
  it("refuses, by name, when the target map has no scripts.inc at all", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const refusals = guardGbaIndicatorWrite(root, "NoScriptsMap", "NoScriptsMap_EventScript_PokemonIndicator1");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("NO_SCRIPTS_INC");
      expect(refusals[0]!.fix).toMatch(/scripts\.inc/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses when the derived script label already exists in scripts.inc -- a genuine collision, not a guess about what the player meant", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "Route101_EventScript_PokemonIndicator1::\n\tend\n");
      const refusals = guardGbaIndicatorWrite(root, "Route101", "Route101_EventScript_PokemonIndicator1");
      expect(refusals).toHaveLength(1);
      expect(refusals[0]!.code).toBe("SIGN_LABEL_EXISTS");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("returns an empty array when scripts.inc exists and the label is free", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-sign-"));
    try {
      const dir = join(root, "data", "maps", "Route101");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "scripts.inc"), "SomeOtherLabel::\n\tend\n");
      expect(guardGbaIndicatorWrite(root, "Route101", "Route101_EventScript_PokemonIndicator1")).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("Indicator species guard", () => {
  it("names species_names.h for an unknown species or unreadable name table", () => {
    const root = mkdtempSync(join(tmpdir(), "pokemap-indicator-"));
    try {
      const scripts = join(root, "data/maps/Route101");
      mkdirSync(scripts, { recursive: true });
      writeFileSync(join(scripts, "scripts.inc"), "");
      const label = "Route101_EventScript_PokemonIndicator1";
      expect(guardGbaIndicatorWrite(root, "Route101", label, "MISSING")[0]!.message).toContain("species_names.h");
      const names = join(root, "src/data/text");
      mkdirSync(names, { recursive: true });
      writeFileSync(join(names, "species_names.h"), '[SPECIES_RATTATA] = _("RATTATA"),\n/* [SPECIES_MISSING] = _("MISSING"), */\n');
      expect(guardGbaIndicatorWrite(root, "Route101", label, "MISSING")[0]!.message).toContain("species_names.h");
      expect(guardGbaIndicatorWrite(root, "Route101", label, "SPECIES_RATTATA")).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
