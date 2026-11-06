import { describe, it, expect } from "vitest";
import { definedNames } from "../../src/addEvent/names.js";

describe("definedNames - GBA", () => {
  it("extracts labels with single colon", () => {
    const text = "MyLabel:\n\tend\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["MyLabel"]));
  });

  it("extracts labels with double colon", () => {
    const text = "GlobalLabel::\n\tend\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["GlobalLabel"]));
  });

  it("extracts .set Name,", () => {
    const text = ".set MY_CONST, 42\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["MY_CONST"]));
  });

  it("extracts .equ Name,", () => {
    const text = ".equ ANOTHER_CONST, 100\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["ANOTHER_CONST"]));
  });

  it("extracts #define Name", () => {
    const text = "#define FLAG_TEST 1\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["FLAG_TEST"]));
  });

  it("extracts #  define Name (multiple spaces)", () => {
    const text = "#  define VAR_TEST 2\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["VAR_TEST"]));
  });

  it("ignores local labels (.foo)", () => {
    const text = ".local:\n\tend\n";
    expect(definedNames(text, "gba")).toEqual(new Set());
  });

  it("ignores references like goto Foo", () => {
    const text = "MyLabel:\n\tgoto OtherLabel\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["MyLabel"]));
  });

  it("ignores jumptext references", () => {
    const text = "Script:\n\tjumptext SomeText\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["Script"]));
  });

  it("ignores commented-out definitions", () => {
    const text = "@ #define COMMENTED 1\n// .set ALSO_COMMENTED, 2\n#define REAL 3\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["REAL"]));
  });

  it("handles mixed definitions", () => {
    const text = `
Label1:
	.set CONST1, 1
.equ CONST2, 2
#define FLAG_A 3
Label2::
	.end
`;
    expect(definedNames(text, "gba")).toEqual(new Set(["Label1", "CONST1", "CONST2", "FLAG_A", "Label2"]));
  });

  it("ignores references in instructions like setvar", () => {
    const text = "Label:\n\tsetvar VAR_TEST, 1 @ comment\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["Label"]));
  });
});

describe("definedNames - GBC", () => {
  it("extracts labels with single colon", () => {
    const text = "MyLabel:\n\tend\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["MyLabel"]));
  });

  it("extracts labels with double colon", () => {
    const text = "GlobalLabel::\n\tend\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["GlobalLabel"]));
  });

  it("extracts const Name", () => {
    const text = "const MY_CONST\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["MY_CONST"]));
  });

  it("extracts DEF Name EQU", () => {
    const text = "DEF FLAG_TEST EQU 1\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["FLAG_TEST"]));
  });

  it("extracts DEF Name EQUS", () => {
    const text = 'DEF TEXT_TEST EQUS "hello"\n';
    expect(definedNames(text, "gbc")).toEqual(new Set(["TEXT_TEST"]));
  });

  it("extracts DEF Name =", () => {
    const text = "DEF VAR_TEST = 42\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["VAR_TEST"]));
  });

  it("extracts Name EQU (no DEF)", () => {
    const text = "ANOTHER_CONST EQU 100\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["ANOTHER_CONST"]));
  });

  it("extracts Name EQUS (no DEF)", () => {
    const text = 'TEXT_CONST EQUS "world"\n';
    expect(definedNames(text, "gbc")).toEqual(new Set(["TEXT_CONST"]));
  });

  it("ignores local labels (.foo)", () => {
    const text = ".local:\n\tend\n";
    expect(definedNames(text, "gbc")).toEqual(new Set());
  });

  it("ignores references like jumptext Foo", () => {
    const text = "Script:\n\tjumptext SomeText\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["Script"]));
  });

  it("ignores commented-out definitions", () => {
    const text = "; const COMMENTED\n; DEF ALSO_COMMENTED EQU 1\nconst REAL\n";
    expect(definedNames(text, "gbc")).toEqual(new Set(["REAL"]));
  });

  it("handles mixed definitions", () => {
    const text = `
Label1:
	const CONST1
	DEF FLAG_A EQU 1
Label2::
	DEF TEXT_B EQUS "hi"
ANOTHER EQU 2
`;
    expect(definedNames(text, "gbc")).toEqual(new Set(["Label1", "CONST1", "FLAG_A", "Label2", "TEXT_B", "ANOTHER"]));
  });
});

describe("definedNames - edge cases", () => {
  it("returns empty set for empty string", () => {
    expect(definedNames("", "gba")).toEqual(new Set());
    expect(definedNames("", "gbc")).toEqual(new Set());
  });

  it("handles Windows line endings", () => {
    const text = "Label:\r\n\tend\r\n";
    expect(definedNames(text, "gba")).toEqual(new Set(["Label"]));
    expect(definedNames(text, "gbc")).toEqual(new Set(["Label"]));
  });

  it("does not match partial names in strings", () => {
    const text = 'MyLabel:\n\t.string "NOT_A_LABEL"\n';
    expect(definedNames(text, "gba")).toEqual(new Set(["MyLabel"]));
    expect(definedNames(text, "gbc")).toEqual(new Set(["MyLabel"]));
  });
});