import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findGbcSign, insertGbcSign, nextGbcSignNumber, renderGbcBody, updateGbcSign } from "../../src/gbc/signs.js";
import { replaceLines } from "../../src/gbc/write/asmSplice.js";
import { signHash } from "../../src/signs/marker.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "./helpers/corpus.js";

const tiny = "Tiny_MapScripts:\n\tdef_scene_scripts\n\tdef_callbacks\n\nTiny_MapEvents:\n\tdb 0, 0\n\tdef_warp_events\n\tdef_coord_events\n\tdef_bg_events\n\tdef_object_events\n";
const original = "Sign:\n\tjumptext SignText\n\nSignText:\n\ttext \"HELLO\"\n\tdone\n";

describe("GBC sign source", () => {
  it("B1 inserts the exact S8 block, preserving EOL and final-newline state", () => {
    // FNV value below independently calculated over tab-text through done, including LF.
    const expected = "Tiny_MapScripts:\n\tdef_scene_scripts\n\tdef_callbacks\n\nTinyPokemapSign1:\n\tjumptext TinyPokemapSign1Text\n\n; pokemap:sign free 11eed898\nTinyPokemapSign1Text:\n\ttext \"HELLO\"\n\tdone\n\nTiny_MapEvents:\n\tdb 0, 0\n\tdef_warp_events\n\tdef_coord_events\n\tdef_bg_events\n\tdef_object_events\n";
    expect(insertGbcSign(tiny, "Tiny", 1, "free", [["HELLO"]])).toBe(expected);
    expect(insertGbcSign(tiny.trimEnd().replace(/\n/g, "\r\n"), "Tiny", 1, "free", [["HELLO"]]))
      .toBe(expected.trimEnd().replace(/\n/g, "\r\n"));
  });

  it("renders paragraph commands and reads line/cont into the same paragraph", () => {
    const lines = ['\ttext "A"', '\tline "B"', '\tcont "C"', "", '\tpara "D"', '\tline "E"', "\tdone"];
    expect(renderGbcBody([["A", "B", "C"], ["D", "E"]])).toEqual(lines);
    const text = original.replace('\ttext "HELLO"\n\tdone', lines.join("\n"));
    const block = findGbcSign(text, "Sign");
    expect(block.paragraphs).toEqual([["A", "B", "C"], ["D", "E"]]);
    expect(text.split("\n").slice(block.bodyStart, block.bodyEnd).join("\n") + "\n").toBe(block.body);
  });

  it("allocates the lowest unused label and refuses both script and text collisions", () => {
    expect(nextGbcSignNumber("TinyPokemapSign1:\nTinyPokemapSign3:\n", "Tiny")).toBe(2);
    expect(() => insertGbcSign("TinyPokemapSign1:\n" + tiny, "Tiny", 1, "free", [["X"]])).toThrow(/collision/);
    expect(() => insertGbcSign("TinyPokemapSign1Text:\n" + tiny, "Tiny", 1, "free", [["X"]])).toThrow(/collision/);
    expect(() => insertGbcSign("", "Tiny", 1, "free", [["X"]])).toThrow("missing Tiny_MapEvents: label");
  });

  it.each([
    [original.replace("jumptext SignText", "opentext\n\twritetext SignText"), "script is not a single jumptext"],
    [original.replace("jumptext SignText", "jumptext SignText\nMACRO Hidden\n\tend\nENDM"), "script is not a single jumptext"],
    [original.replace("SignText:", "Elsewhere:"), "text label not found in this file"],
    [original + "Other:\n\tjumptext SignText\n", "shared text"],
    [original + "Other:\n\twritetext SignText\n", "shared text"],
    [original + "Other:\n\ttext_far SignText\n", "shared text"],
    [original.replace("\tdone", "\tprompt"), "unsupported text command prompt"],
    [original.replace("\tdone", "MACRO Hidden\nENDM\n\tdone"), "unsupported text command MACRO"],
    [original.replace("\tdone\n", ""), "unsupported text command missing done"],
    [original.replace('\ttext "HELLO"', '\ttext "HELLO; WORLD" ; comment'), null],
  ])("refuses unsupported or shared source without guessing (%s)", (text, reason) => {
    const block = findGbcSign(text, "Sign");
    expect(block.reason).toBe(reason);
    expect(block.editable).toBe(reason === null);
  });

  it("requires an adoption baseline and checks marked bodies before updating", () => {
    const block = findGbcSign(original, "Sign");
    expect(() => updateGbcSign(original, block, "free", [["NEW"]], { force: false })).toThrow("hand-edited");
    expect(() => updateGbcSign(original, block, "free", [["NEW"]], { force: false, baselineHash: "00000000" })).toThrow("hand-edited");
    const adopted = updateGbcSign(original, block, "name", block.paragraphs, { force: false, baselineHash: signHash(block.body) });
    const marked = findGbcSign(adopted, "Sign");
    expect(marked.marker?.mode).toBe("name");
    expect(updateGbcSign(adopted, marked, "name", marked.paragraphs, { force: false })).toBe(adopted);
    const edited = adopted.replace("HELLO", "HALLO");
    const editedBlock = findGbcSign(edited, "Sign");
    expect(() => updateGbcSign(edited, editedBlock, "name", [["NEW"]], { force: false, baselineHash: signHash(editedBlock.body) })).toThrow("hand-edited");
    const forced = updateGbcSign(edited, editedBlock, "name", [["NEW"]], { force: true });
    expect(findGbcSign(forced, "Sign").paragraphs).toEqual([["NEW"]]);
    expect(findGbcSign(forced, "Sign").marker?.hash).toBe(signHash(findGbcSign(forced, "Sign").body));
    expect(forced.match(/pokemap:sign/g)).toHaveLength(1);
  });

  it("checks the current source even when the caller passes a stale block", () => {
    const block = findGbcSign(original, "Sign");
    const edited = original.replace("HELLO", "HALLO");
    expect(() => updateGbcSign(edited, block, "free", [["NEW"]], { force: false, baselineHash: signHash(block.body) })).toThrow("hand-edited");
    expect(() => updateGbcSign(original.replace("\tdone", ""), block, "free", [["NEW"]], { force: true })).toThrow("hand-edited");
  });

  it("updates only the body and marker in CRLF source without a final newline", () => {
    const text = (original + "\nTail:\n\tend").replace(/\n/g, "\r\n");
    const block = findGbcSign(text, "Sign");
    const changed = updateGbcSign(text, block, "free", [["NEW"]], { force: false, baselineHash: signHash(block.body) });
    expect(changed.replace(/^; pokemap:sign free [0-9a-f]{8}\r\n/m, "")).toBe(text.replace("HELLO", "NEW"));
    const eofText = original.trimEnd().replace(/\n/g, "\r\n");
    const eofBlock = findGbcSign(eofText, "Sign");
    const eofChanged = updateGbcSign(eofText, eofBlock, "free", [["NEW"]], { force: true });
    const found = findGbcSign(eofChanged, "Sign");
    expect(eofChanged.endsWith("\n")).toBe(false);
    expect(found.marker?.hash).toBe(signHash(found.body));
  });

  it("refuses text capable of injecting assembly lines or string terminators", () => {
    for (const paragraphs of [[], [[]], [['bad"']], [["bad\nline"]], [["bad@"]], [["bad\\"]]]) {
      expect(() => renderGbcBody(paragraphs)).toThrow();
    }
  });

  itWithGbcCorpus("B6 reads Route29Sign1 and adopts unchanged source by adding only a marker", () => {
    const text = readFileSync(`${GBC_SUBJECT_ROOT}/maps/Route29.asm`, "utf8");
    const block = findGbcSign(text, "Route29Sign1");
    expect(block.editable).toBe(true);
    expect(block.paragraphs).toEqual([["ROUTE 29"], ["CHERRYGROVE CITY -", "NEW BARK TOWN"]]);
    const updated = updateGbcSign(text, block, "free", block.paragraphs, { force: false, baselineHash: signHash(block.body) });
    expect(updated.replace(/^; pokemap:sign free [0-9a-f]{8}\r?\n/m, "")).toBe(text);
  });

  itWithGbcCorpus("opens PerfPlus GoldenrodCityPokecenterSign read-only", () => {
    const text = readFileSync(`${GBC_SUBJECT_ROOT}/maps/GoldenrodCity.asm`, "utf8");
    expect(text).toMatch(/bg_event[^\n]+GoldenrodCityPokecenterSign/);
    expect(findGbcSign(text, "GoldenrodCityPokecenterSign")).toMatchObject({ editable: false, reason: "script is not a single jumptext" });
  });
});

describe("replaceLines", () => {
  it.each([
    ["a\nb\nc\n", 1, 2, ["X", "Y"], "a\nX\nY\nc\n"],
    ["a\r\nb\r\nc", 1, 2, ["X", "Y"], "a\r\nX\r\nY\r\nc"],
    ["a\nb\r\nc\n", 1, 2, ["X"], "a\nX\nc\n"],
    ["a\nb", 1, 2, [], "a"],
    ["a\nb\n", 1, 2, [], "a\n"],
    ["a", 1, 1, ["b"], "a\nb"],
    ["", 0, 0, ["a"], "a"],
    ["a\n", 0, 1, [], ""],
  ])("splices lines and preserves final-newline state (%s)", (text, start, end, lines, expected) => {
    expect(replaceLines(text, start, end, lines)).toBe(expected);
  });
  it("refuses invalid ranges and embedded newlines", () => {
    expect(() => replaceLines("a", -1, 0, [])).toThrow();
    expect(() => replaceLines("a", 0, 2, [])).toThrow();
    expect(() => replaceLines("a", 1, 0, [])).toThrow();
    expect(() => replaceLines("a", 0, 1, ["a\nb"])).toThrow();
  });
});
