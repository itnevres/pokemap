import { it, expect } from "vitest";
import { itWithGbcCorpus, GBC_SUBJECT_ROOT } from "../gbc/helpers/corpus.js";
import { readFileSync } from "node:fs";
import { parseGbcCharmap, tokenize } from "../../src/signs/charmap.js";
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
