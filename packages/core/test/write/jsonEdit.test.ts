import { describe, it, expect } from "vitest";
import { editJson, insertArrayElement, removeArrayElement } from "../../src/write/jsonEdit.js";
import { openProject } from "../../src/project.js";
import { readFileSync } from "node:fs";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

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

const SAMPLE_OBJECT_EVENT = {
  graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 5, y: 5, elevation: 0,
  movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 0, movement_range_y: 0,
  trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0",
  script: "PokeMap_EventScript_Test", flag: "0",
};

describe("insertArrayElement / removeArrayElement", () => {
  it("inserts into an EMPTY array, producing valid JSON with no internal formatting invented", () => {
    const src = '{ "connections": [] }';
    const out = insertArrayElement(src, ["connections"], 0, { map: "MAP_A" });
    expect(out).toBe('{ "connections": [{"map":"MAP_A"}] }');
  });

  it("appends after the last element, reusing the exact separator style already used between the other elements", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    { "map": "MAP_B", "offset": 3, "direction": "right" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 2, { map: "MAP_C", offset: 0, direction: "up" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    { "map": "MAP_B", "offset": 3, "direction": "right" },
    {"map":"MAP_C","offset":0,"direction":"up"}
  ]
}`);
  });

  it("appends into a SINGLE-element array, synthesising a separator from the array's own lead-in indentation (no sibling pair to copy from)", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 1, { map: "MAP_B" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A", "offset": -5, "direction": "left" },
    {"map":"MAP_B"}
  ]
}`);
  });

  it("inserts BEFORE an existing element, at index 0, shifting it right and matching indentation", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 0, { map: "MAP_NEW" });
    expect(out).toBe(`{
  "connections": [
    {"map":"MAP_NEW"},
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`);
  });

  it("inserts BEFORE an existing element in the middle (index 1 of 2)", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" }
  ]
}`;
    const out = insertArrayElement(src, ["connections"], 1, { map: "MAP_NEW" });
    expect(out).toBe(`{
  "connections": [
    { "map": "MAP_A" },
    {"map":"MAP_NEW"},
    { "map": "MAP_B" }
  ]
}`);
  });

  it("insert then remove at the SAME index is the identity, for every position in a 3-element array", () => {
    const src = `{
  "connections": [
    { "map": "MAP_A" },
    { "map": "MAP_B" },
    { "map": "MAP_C" }
  ]
}`;
    for (const index of [0, 1, 2, 3]) {
      const inserted = insertArrayElement(src, ["connections"], index, { map: "MAP_TEMP" });
      expect(removeArrayElement(inserted, ["connections"], index), `index ${index}`).toBe(src);
    }
  });

  it("removeArrayElement on the LAST remaining element collapses to a bare [], not a blank-line array", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(removeArrayElement(src, ["connections"], 0)).toBe('{ "connections": [] }');
  });

  it("removeArrayElement refuses (throws) an index past the end, matching enterIndex's own existing message", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(() => removeArrayElement(src, ["connections"], 5)).toThrow(/not present/i);
  });

  it("insertArrayElement refuses (throws) an index past length + 1", () => {
    const src = '{ "connections": [{"map":"MAP_A"}] }';
    expect(() => insertArrayElement(src, ["connections"], 5, { map: "X" })).toThrow(/out of range/i);
  });

  // No real map.json (nor any synthetic fixture above) has space-before-comma
  // formatting, so walkArray's VALUE_START guard is otherwise never exercised
  // -- without it, a "," found where an element was expected would be
  // misread as a zero-length element instead of raising a clear error.
  it("refuses space-before-comma array formatting with a clear error instead of corrupting the array", () => {
    const src = '{ "list": [ "a" , "b" ] }';
    expect(() => insertArrayElement(src, ["list"], 2, "c")).toThrow(/malformed|unsupported/i);
  });

  // The gate test, from the design spec's own original text -- exhaustive
  // over the real corpus, guarded per Plan 0 §7's own rule (confirm with
  // --reporter=verbose that it actually ran, not silently skipped).
  itWithCorpus("insert then remove is the identity across every real map.json's object_events array", () => {
    const proj = openProject(SUBJECT_ROOT);
    for (const name of proj.mapNames()) {
      const src = readFileSync(proj.paths.mapJson(name), "utf8");
      const parsed = JSON.parse(src);
      // A handful of real maps (the contest halls) use "shared_events_map"
      // and omit "object_events" entirely -- a genuinely ABSENT key, not an
      // empty array. That is exactly the case this module refuses by
      // design (enterKey's "adding keys is an explicit operation" message),
      // so insertArrayElement correctly throws there; it is not part of
      // this identity property, which is about editing an array that
      // already exists (empty or not).
      if (!("object_events" in parsed)) continue;
      const n = (parsed.object_events ?? []).length;
      const added = insertArrayElement(src, ["object_events"], n, SAMPLE_OBJECT_EVENT);
      expect(removeArrayElement(added, ["object_events"], n), name).toBe(src);
    }
  }, 900_000);
});
