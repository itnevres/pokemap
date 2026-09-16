import { describe, it, expect } from "vitest";
import { generateSignScript } from "../../src/signs/script.js";

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

describe("generateSignScript", () => {
  it("reproduces the real CeladonCity_EventScript_Poliwrath / CeladonCity_Text_Poliwrath pair byte-for-byte when given the same label, species and dialogue", () => {
    const out = generateSignScript({
      scriptLabel: "CeladonCity_EventScript_Poliwrath",
      textLabel: "CeladonCity_Text_Poliwrath",
      species: "POLIWRATH",
      dialogue: "POLIWRATH: Ribi ribit!",
    });
    expect(out.script).toBe(GOLDEN_SCRIPT);
    expect(out.text).toBe(GOLDEN_TEXT);
  });

  it("derives scriptLabel/textLabel from mapName+species when not given explicitly, using the project's own _EventScript_/_Text_ naming convention", () => {
    const out = generateSignScript({ mapName: "Route101", species: "RATTATA", dialogue: "RATTATA: Skreee!" });
    expect(out.scriptLabel).toBe("Route101_EventScript_WildSign_Rattata");
    expect(out.textLabel).toBe("Route101_Text_WildSign_Rattata");
    expect(out.script.startsWith("Route101_EventScript_WildSign_Rattata::\n")).toBe(true);
  });

  it("a species name with an underscore or hyphen (e.g. NIDORAN_F, MR_MIME) title-cases correctly in the derived label with no stray separators", () => {
    const out = generateSignScript({ mapName: "Route101", species: "NIDORAN_F", dialogue: "..." });
    expect(out.scriptLabel).toBe("Route101_EventScript_WildSign_NidoranF");
  });

  it("throws a named, actionable error (not a malformed script) when dialogue is empty", () => {
    expect(() => generateSignScript({ mapName: "Route101", species: "RATTATA", dialogue: "" }))
      .toThrow(/dialogue.*empty/i);
  });
});
