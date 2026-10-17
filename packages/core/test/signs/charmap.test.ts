import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { itWithCorpus, SUBJECT_ROOT } from "../helpers/corpus.js";
import { itWithGbcCorpus, GBC_SUBJECT_ROOT } from "../gbc/helpers/corpus.js";
import {
  parseGbcCharmap,
  parseGbaCharmap,
  tokenize,
} from "../../src/signs/charmap.js";

itWithGbcCorpus("parses GBC charmap from real file", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  expect(cm.has("A")).toBe(true);
  expect(cm.has("<PLAYER>")).toBe(true);
  expect(cm.has("@")).toBe(false);
  expect(cm.widthOf("<PLAYER>")).toBe(7);
  expect(cm.has("<BSP>")).toBe(true);
  expect(cm.has("<LF>")).toBe(false);
  expect(cm.has("<PARA>")).toBe(false);
});

itWithGbcCorpus("tokenizes GBC text with real charmap", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = tokenize("HI <PLAYER>", cm);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.tokens).toEqual(["H", "I", " ", "<PLAYER>"]);
});

itWithCorpus("parses GBA charmap from real file", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  expect(cm.has("{UP_ARROW}")).toBe(true);
  expect(cm.has("{PLAYER}")).toBe(true);
  expect(cm.widthOf("{PLAYER}")).toBe(7);
  expect(cm.has("A")).toBe(true);
  expect(cm.has("$")).toBe(false);
  expect(cm.has("\n")).toBe(false);
});

itWithCorpus("tokenizes GBA text with real charmap", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  const result = tokenize("HI {PLAYER}", cm);
  if ("refusal" in result) throw new Error(result.refusal);
  expect(result.tokens).toEqual(["H", "I", " ", "{PLAYER}"]);
});

// Inline tests that always run (no corpus needed)
it("parses minimal GBC charmap inline", () => {
  const minimal = `
charmap "A", $80
charmap "B", $81
charmap " ", $7f
charmap "-", $e3
charmap "<PLAYER>", $52
charmap "<BSP>", $1f
charmap "@", $50
charmap "<LF>", $22
`;
  const cm = parseGbcCharmap(minimal);
  expect(cm.has("A")).toBe(true);
  expect(cm.has("<PLAYER>")).toBe(true);
  expect(cm.has("@")).toBe(false);
  expect(cm.has("<LF>")).toBe(false);
  expect(cm.widthOf("<PLAYER>")).toBe(7);
  expect(cm.widthOf("A")).toBe(1);
  expect(cm.widthOf("-")).toBe(1);
});

it("parses minimal GBA charmap inline", () => {
  const minimal = `
' ' = 00
'A' = BB
'-' = AE
UP_ARROW = 79
PLAYER = FD 01
RIVAL = FD 06
`;
  const cm = parseGbaCharmap(minimal);
  expect(cm.has("A")).toBe(true);
  expect(cm.has("{UP_ARROW}")).toBe(true);
  expect(cm.has("{PLAYER}")).toBe(true);
  expect(cm.has("{RIVAL}")).toBe(true);
  expect(cm.widthOf("{PLAYER}")).toBe(7);
  expect(cm.widthOf("{RIVAL}")).toBe(7);
  expect(cm.widthOf("A")).toBe(1);
});

it("tokenize refuses double quote", () => {
  const minimal = `charmap "A", $80`;
  const cm = parseGbcCharmap(minimal);
  const result = tokenize('A"B', cm);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain('"');
});

it("tokenize refuses unknown character", () => {
  const minimal = `charmap "A", $80`;
  const cm = parseGbcCharmap(minimal);
  const result = tokenize("A~B", cm);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("~");
});

it("tokenize refuses unknown token", () => {
  const minimal = `charmap "A", $80`;
  const cm = parseGbcCharmap(minimal);
  const result = tokenize("A<FOO>B", cm);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("<FOO>");
});

// New tests from fix round 1

it("GBA real charmap: allows l, p, = and disallows empty string and $", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  expect(cm.has("l")).toBe(true);
  expect(cm.has("p")).toBe(true);
  expect(cm.has("=")).toBe(true);
  expect(cm.has("")).toBe(false);
  expect(cm.has("$")).toBe(false);
});

itWithCorpus("GBA real charmap: widths of multi-byte tokens", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  expect(cm.widthOf("{PKMN}")).toBe(2);
  expect(cm.widthOf("{POKEBLOCK}")).toBe(5);
  expect(cm.widthOf("{KYOGRE}")).toBe(7);
  expect(cm.has("{COLOR}")).toBe(false);
  expect(cm.has("{STRING}")).toBe(false);
});

itWithGbcCorpus("GBC real charmap: token widths and control tokens", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  expect(cm.widthOf("<POKE>")).toBe(2);
  expect(cm.widthOf("<TRAINER>")).toBe(7);
  expect(cm.widthOf("<PK>")).toBe(1);
  expect(cm.has("<NULL>")).toBe(false);
  expect(cm.has("<SCROLL>")).toBe(false);
});

it("empty GBC charmap text throws", () => {
  expect(() => parseGbcCharmap("")).toThrow("gbc charmap has no entries");
});

it("empty GBA charmap text throws", () => {
  expect(() => parseGbaCharmap("")).toThrow("gba charmap has no entries");
});

itWithGbcCorpus("GBC real charmap: refuses ~", () => {
  const text = readFileSync(`${GBC_SUBJECT_ROOT}/constants/charmap.asm`, "utf8");
  const cm = parseGbcCharmap(text);
  const result = tokenize("A~B", cm);
  if (!("refusal" in result)) throw new Error("Expected refusal");
  expect(result.refusal).toContain("~");
});

itWithCorpus("GBA real charmap: has apostrophe", () => {
  const text = readFileSync(`${SUBJECT_ROOT}/charmap.txt`, "utf8");
  const cm = parseGbaCharmap(text);
  expect(cm.has("'")).toBe(true);
});
