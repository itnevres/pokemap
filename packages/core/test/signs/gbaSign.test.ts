import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findGbaSign, renderGbaBody, gbaSignScript, gbaSignText, nextGbaSignNumber, updateGbaSign } from "../../src/signs/gbaSign.js";
import { signHash } from "../../src/signs/marker.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const original = 'Sign::\n\tmsgbox Text, MSGBOX_SIGN\n\tend\n\nText:\n\t.string "HELLO$"\n';

describe("GBA sign source", () => {
  itWithCorpus("reads the real Route101 sign and refuses a real NPC script", () => {
    const text = readFileSync(`${SUBJECT_ROOT}/data/maps/Route101/scripts.inc`, "utf8");
    expect(findGbaSign(text, "Route101_EventScript_RouteSign")).toMatchObject({ editable: true, paragraphs: [["ROUTE 101", "{UP_ARROW} OLDALE TOWN"]] });
    const npc = /^(\w+)::\r?\n\s*msgbox[^\n]+MSGBOX_NPC/m.exec(text);
    expect(npc).not.toBeNull();
    expect(findGbaSign(text, npc![1]!)).toMatchObject({ editable: false, reason: "script is not a single msgbox sign" });
  });

  it("renders exact line, scroll, paragraph and terminator escapes and reads them back", () => {
    expect(renderGbaBody([["ROUTE 101", "{UP_ARROW} OLDALE TOWN"]])).toEqual(['\t.string "ROUTE 101\\n"', '\t.string "{UP_ARROW} OLDALE TOWN$"']);
    const paragraphs = [["A", "B", "C"], ["D", "E"]];
    const lines = ['\t.string "A\\n"', '\t.string "B\\l"', '\t.string "C\\p"', '\t.string "D\\n"', '\t.string "E$"'];
    expect(renderGbaBody(paragraphs)).toEqual(lines);
    expect(findGbaSign(original.replace('\t.string "HELLO$"', lines.join("\n")), "Sign").paragraphs).toEqual(paragraphs);
  });

  it("generates the S9 labels, marker and lowest unused number", () => {
    expect(gbaSignScript("Tiny", 1)).toEqual(["Tiny_EventScript_PokemapSign1::", "\tmsgbox Tiny_Text_PokemapSign1, MSGBOX_SIGN", "\tend"]);
    const lines = gbaSignText("Tiny", 1, "species", [["HELLO"]]);
    expect(lines).toEqual([`@ pokemap:sign species ${signHash('\t.string "HELLO$"\n')}`, "Tiny_Text_PokemapSign1:", '\t.string "HELLO$"']);
    expect(nextGbaSignNumber("Tiny_EventScript_PokemapSign1::\nTiny_Text_PokemapSign2:\nTiny_EventScript_PokemapSign4::\n", "Tiny")).toBe(3);
    expect(() => gbaSignScript("bad\nlabel", 1)).toThrow();
    expect(() => gbaSignText("Tiny", 0, "free", [["X"]])).toThrow();
  });

  it.each([
    [original.replace("MSGBOX_SIGN", "MSGBOX_NPC"), "script is not a single msgbox sign"],
    [original.replace("\tend", "\tcall Other\n\tend"), "script is not a single msgbox sign"],
    [original.replace("Text:", "Missing:"), "text label not found in this file"],
    [original + "Other::\n\tmsgbox Text, MSGBOX_DEFAULT\n\tend\n", "shared text"],
    [original + "Other::\n\tloadword 0, Text\n\tend\n", "shared text"],
    [original.replace('"HELLO$"', '"HELLO"'), "unsupported text command missing terminator"],
    [original.replace('.string "HELLO$"', '.byte 0'), "unsupported text command .byte"],
    [original.replace('HELLO$', 'HELLO$TAIL'), "unsupported text command .string"],
    [original.replace('HELLO$', 'HELLO\\q$'), "unsupported text command .string"],
  ])("refuses unsupported source (%s)", (text, reason) => {
    expect(findGbaSign(text, "Sign")).toMatchObject({ editable: false, reason });
  });

  it("preserves unchanged body bytes on adoption and guards stale and marked source", () => {
    const text = original.replace('\t.string "HELLO$"', '    .string "HELLO$" @ original');
    const block = findGbaSign(text, "Sign");
    expect(() => updateGbaSign(text, block, "name", [["NEW"]], { force: false })).toThrow("hand-edited");
    expect(() => updateGbaSign(text, block, "name", [["NEW"]], { force: false, baselineHash: "00000000" })).toThrow("hand-edited");
    const adopted = updateGbaSign(text, block, "name", block.paragraphs, { force: false, baselineHash: signHash(block.body) });
    expect(adopted.replace(/^@ pokemap:sign name [0-9a-f]{8}\n/m, "")).toBe(text);
    const marked = findGbaSign(adopted, "Sign");
    expect(updateGbaSign(adopted, marked, "name", marked.paragraphs, { force: false })).toBe(adopted);
    const edited = adopted.replace("HELLO", "HALLO");
    expect(() => updateGbaSign(edited, marked, "free", [["NEW"]], { force: false })).toThrow("hand-edited");
    const forced = updateGbaSign(edited, marked, "free", [["NEW"]], { force: true });
    const fresh = findGbaSign(forced, "Sign");
    expect(fresh.paragraphs).toEqual([["NEW"]]);
    expect(fresh.marker).toEqual({ mode: "free", hash: signHash(fresh.body) });
    expect(forced.match(/pokemap:sign/g)).toHaveLength(1);
    expect(() => updateGbaSign(text.replace('HELLO$', 'HELLO'), block, "free", [["NEW"]], { force: true })).toThrow("hand-edited");
  });

  it.each([true, false])("preserves CRLF and final-newline state (%s)", (final) => {
    const text = (final ? original : original.trimEnd()).replace(/\n/g, "\r\n");
    const changed = updateGbaSign(text, findGbaSign(text, "Sign"), "free", [["NEW"]], { force: true });
    expect(changed.replace(/^@ pokemap:sign free [0-9a-f]{8}\r\n/m, "")).toBe(text.replace("HELLO", "NEW"));
    const block = findGbaSign(changed, "Sign");
    expect(block.marker?.hash).toBe(signHash(block.body));
  });

  it("refuses empty paragraphs and assembly/control injection", () => {
    for (const p of [[], [[]], [['bad"']], [["bad$"]], [["bad\\n"]], [["bad\nline"]], [["bad\r"]]]) expect(() => renderGbaBody(p)).toThrow();
  });
});
