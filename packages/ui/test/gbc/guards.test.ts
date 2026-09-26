import { describe, it, expect } from "vitest";
import { isProjectInfo, isMapGroupsData } from "../../src/gbc/guards.js";

describe("isProjectInfo", () => {
  it("accepts a real gba ProjectInfo", () => {
    expect(isProjectInfo({ family: "gba", root: "/tmp/pokeemerald" })).toBe(true);
  });

  it("accepts a real gbc ProjectInfo", () => {
    expect(isProjectInfo({ family: "gbc", root: "/tmp/pokecrystal" })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isProjectInfo(null)).toBe(false);
    expect(isProjectInfo(undefined)).toBe(false);
    expect(isProjectInfo("gba")).toBe(false);
    expect(isProjectInfo(42)).toBe(false);
    expect(isProjectInfo([])).toBe(false);
  });

  it("rejects a family that isn't exactly gba or gbc", () => {
    expect(isProjectInfo({ family: "n64", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ family: "GBA", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ family: "", root: "/tmp/x" })).toBe(false);
    expect(isProjectInfo({ root: "/tmp/x" })).toBe(false);
  });

  it("rejects a non-string root", () => {
    expect(isProjectInfo({ family: "gba", root: 42 })).toBe(false);
    expect(isProjectInfo({ family: "gba", root: null })).toBe(false);
    expect(isProjectInfo({ family: "gba" })).toBe(false);
  });
});

describe("isMapGroupsData", () => {
  const VALID = { groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"], MAHOGANY: ["MahoganyTown"] } };

  it("accepts a real-shaped payload", () => {
    expect(isMapGroupsData(VALID)).toBe(true);
  });

  it("accepts an empty groupOrder/groups pair", () => {
    expect(isMapGroupsData({ groupOrder: [], groups: {} })).toBe(true);
  });

  it("accepts a group with an empty map list", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: [] } })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isMapGroupsData(null)).toBe(false);
    expect(isMapGroupsData(undefined)).toBe(false);
    expect(isMapGroupsData("x")).toBe(false);
    expect(isMapGroupsData([])).toBe(false);
  });

  it("rejects a non-array groupOrder", () => {
    expect(isMapGroupsData({ groupOrder: "OLIVINE", groups: { OLIVINE: [] } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: { 0: "OLIVINE" }, groups: { OLIVINE: [] } })).toBe(false);
    expect(isMapGroupsData({ groups: { OLIVINE: [] } })).toBe(false);
  });

  it("rejects a groupOrder whose entries aren't all strings", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE", 5], groups: { OLIVINE: [] } })).toBe(false);
  });

  it("rejects a non-plain-object groups", () => {
    expect(isMapGroupsData({ groupOrder: [], groups: null })).toBe(false);
    expect(isMapGroupsData({ groupOrder: [], groups: [] })).toBe(false);
    expect(isMapGroupsData({ groupOrder: [] })).toBe(false);
  });

  it("rejects a groups value that isn't string[]", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: "OlivineCity" } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: [1, 2] } })).toBe(false);
    expect(isMapGroupsData({ groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", 5] } })).toBe(false);
  });

  it("rejects a groupOrder entry that is not a key of groups", () => {
    expect(isMapGroupsData({ groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"] } })).toBe(false);
  });
});
