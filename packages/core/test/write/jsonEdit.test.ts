import { describe, it, expect } from "vitest";
import { editJson } from "../../src/write/jsonEdit.js";

const SRC = `{
  "id": "MAP_TEST",
  "weird_key_pokemap_never_heard_of": 42,
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" }
  ]
}`;

describe("editJson", () => {
  it("is the identity when nothing changes", () => {
    expect(editJson(SRC, [])).toBe(SRC);
  });

  it("replaces one scalar and leaves every other byte alone", () => {
    const out = editJson(SRC, [{ path: ["id"], value: "MAP_RENAMED" }]);
    expect(out).toBe(SRC.replace('"MAP_TEST"', '"MAP_RENAMED"'));
    expect(out).toContain("weird_key_pokemap_never_heard_of");
  });

  it("edits inside an array element without reformatting the array", () => {
    const out = editJson(SRC, [{ path: ["connections", 0, "offset"], value: -7 }]);
    expect(out).toContain('{ "map": "MAP_A", "offset": -7, "direction": "left" }');
  });

  it("never invents a key that was absent", () => {
    expect(() => editJson(SRC, [{ path: ["border_width"], value: 2 }]))
      .toThrow(/absent|not present/i);
  });

  it("preserves CRLF line endings", () => {
    const crlf = SRC.replace(/\n/g, "\r\n");
    expect(editJson(crlf, [])).toBe(crlf);
    expect(editJson(crlf, [{ path: ["id"], value: "X" }])).toContain("\r\n");
  });

  // The container scanner has to skip a value it is not interested in, to reach
  // a later key. Every shape it can meet has to be exercised, and the object
  // containing an array is the one an earlier draft got wrong -- the bug
  // survived because the five tests above only ever skip past strings and
  // numbers, never past a container.
  it("skips past a nested value of every shape to reach a later key", () => {
    const shapes: [string, string][] = [
      ["array of objects", '[{ "a": 1 }, { "b": 2 }]'],
      ["object with array", '{ "a": [1, 2] }'],
      ["object in object", '{ "a": { "b": 1 } }'],
      ["array of arrays", "[[1], [2]]"],
      // The exact shape of wild_encounters.json, which Task 26 reads.
      ["encounter table", '{ "encounter_rate": 20, "mons": [{ "min_level": 2 }] }'],
    ];
    for (const [label, nested] of shapes) {
      const src = `{\n  "skipme": ${nested},\n  "target": 1\n}`;
      expect(editJson(src, [{ path: ["target"], value: 2 }]), label)
        .toBe(src.replace('"target": 1', '"target": 2'));
    }
  });

  it("edits a value nested inside a skipped-over container", () => {
    const src = '{ "wild": { "encounter_rate": 20, "mons": [{ "min_level": 2 }] }, "after": 0 }';
    expect(editJson(src, [{ path: ["wild", "mons", 0, "min_level"], value: 7 }]))
      .toBe(src.replace('"min_level": 2', '"min_level": 7'));
  });

  it("refuses an index that is past the end of an array", () => {
    expect(() => editJson(SRC, [{ path: ["connections", 3, "map"], value: "X" }]))
      .toThrow(/not present/i);
  });

  it("applies several edits at once without disturbing each other's offsets", () => {
    // Edits are applied right-to-left so earlier offsets stay valid. Two edits
    // whose replacement lengths differ from the originals is the case that
    // catches a left-to-right implementation.
    const out = editJson(SRC, [
      { path: ["id"], value: "A_MUCH_LONGER_MAP_NAME" },
      { path: ["connections", 0, "offset"], value: -12345 },
    ]);
    expect(out).toBe(SRC
      .replace('"MAP_TEST"', '"A_MUCH_LONGER_MAP_NAME"')
      .replace('"offset": -5', '"offset": -12345'));
  });
});
