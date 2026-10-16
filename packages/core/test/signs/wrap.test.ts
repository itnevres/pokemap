import { it, expect } from "vitest";
import { itWithGbcCorpus, GBC_SUBJECT_ROOT } from "../gbc/helpers/corpus.js";
import { itWithCorpus, SUBJECT_ROOT } from "../helpers/corpus.js";
import { readFileSync } from "node:fs";
import { parseGbcCharmap, parseGbaCharmap, tokenize } from "../../src/signs/charmap.js";
import { wrapSign } from "../../src/signs/wrap.js";

// Helper to build a minimal GBC charmap for inline tests
function createMinimalGbcCharmap(): ReturnType<
  typeof parseGbcCharmap
> {
  const lines: string[] = [];
  for (let i = 0; i < 26; i++) {
    const char = String.fromCharCode(65 + i);
    lines.push(`charmap "${char}", $${(0x80 + i).toString(16)}`);
  }
  for (let i = 0; i < 10; i++) {
    const digit = String.fromCharCode(48 + i);
    lines.push(`charmap "${digit}", $${(0x30 + i).toString(16)}`);
  }
  lines.push(`charmap " ", $7f`);
  lines.push(`charmap "-", $e3`);
  lines.push(`charmap "<PLAYER>", $52`);
  return parseGbcCharmap(lines.join("\n"));
}

it("wrap 18: wraps long single line into two lines", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign(
    "CHERRYGROVE CITY - NEW BARK TOWN",
    cm,
    18
  );
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["CHERRYGROVE CITY -", "NEW BARK TOWN"]]);
});

it("wrap 18: preserves paragraph breaks from blank lines", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign(
    "ROUTE 29\n\nCHERRYGROVE CITY -\nNEW BARK TOWN",
    cm,
    18
  );
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([
    ["ROUTE 29"],
    ["CHERRYGROVE CITY -", "NEW BARK TOWN"],
  ]);
});

it("wrap 18: refuses single word longer than one line", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign("ABCDEFGHIJKLMNOPQRS", cm, 18); // 19 chars
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("longer than one line (18)");
});

it("wrap refuses double quote character", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign('A"B', cm, 18);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain('"');
});

it("wrap refuses character not in charmap", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign("A~B", cm, 18);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("~");
});

it("wrap counts <PLAYER> as 7 width units", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign("HI <PLAYER> HOW ARE YOU", cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["HI <PLAYER> HOW ARE", "YOU"]]);
});

it("wrap counts <PLAYER> as 7 width units: long word after <PLAYER>", () => {
  const cm = createMinimalGbcCharmap();
  const result = wrapSign("<PLAYER> ABCDEFGHIJK", cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["<PLAYER>", "ABCDEFGHIJK"]]);
});

// Real GBC charmap tests (skip when corpus absent)
itWithGbcCorpus("wrap 18 with real GBC charmap: long single line", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = wrapSign("CHERRYGROVE CITY - NEW BARK TOWN", cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["CHERRYGROVE CITY -", "NEW BARK TOWN"]]);
});

itWithGbcCorpus("wrap 18 with real GBC charmap: paragraph breaks", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = wrapSign(
    "ROUTE 29\n\nCHERRYGROVE CITY -\nNEW BARK TOWN",
    cm,
    18
  );
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([
    ["ROUTE 29"],
    ["CHERRYGROVE CITY -", "NEW BARK TOWN"],
  ]);
});

itWithGbcCorpus("wrap 18 with real GBC charmap: <PLAYER> width", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = wrapSign("HI <PLAYER> HOW ARE YOU", cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["HI <PLAYER> HOW ARE", "YOU"]]);
});

itWithGbcCorpus("wrap 18 with real GBC charmap: <PLAYER> long word after", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = wrapSign("<PLAYER> ABCDEFGHIJK", cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["<PLAYER>", "ABCDEFGHIJK"]]);
});

// New tests from fix round 1

itWithGbcCorpus("wrap 18 with real GBC charmap: refuses ~", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = wrapSign("A~B", cm, 18);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("~");
});

itWithCorpus("wrap 36 with real GBA charmap: simple line", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  const result = wrapSign("Hello people", cm, 36);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.paragraphs).toEqual([["Hello people"]]);
});

itWithCorpus("wrap 36 with real GBA charmap: refuses $", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  const result = wrapSign("A$B", cm, 36);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("$");
});

it("wrap 18: three-line paragraph from short words", () => {
  const cm = createMinimalGbcCharmap();
  // 50-character sentence of short words: "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG"
  const sentence = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG";
  const result = wrapSign(sentence, cm, 18);
  if ("refusal" in result) throw new Error(result.refusal);
  // Expected hand-computed wrapping at width 18:
  // "THE QUICK BROWN" (14) + space + "FOX" (3) = 18 -> "THE QUICK BROWN FOX" is 18? Actually let's compute:
  // Words: THE(3), QUICK(5), BROWN(5), FOX(3), JUMPS(5), OVER(4), THE(3), LAZY(4), DOG(3)
  // Greedy:
  // Line1: THE(3) + space + QUICK(5) = 9, + space + BROWN(5) = 15, + space + FOX(3) = 19 > 18 -> so line1 = "THE QUICK BROWN" (15)
  // Line2: FOX(3) + space + JUMPS(5) = 9, + space + OVER(4) = 14, + space + THE(3) = 18, + space + LAZY(4) = 23 > 18 -> line2 = "FOX JUMPS OVER THE" (18)
  // Line3: LAZY(4) + space + DOG(3) = 8 -> line3 = "LAZY DOG"
  expect(result.paragraphs).toEqual([["THE QUICK BROWN", "FOX JUMPS OVER THE", "LAZY DOG"]]);
});
