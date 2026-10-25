import { describe, expect, it } from "vitest";
import { eventAt, firstEventAt } from "../../src/canvas/events.js";

const lists = [["object", [{ x: 1, y: 1 }]], ["warp", [{ x: 2, y: 2 }, { x: 1, y: 1 }]]] as const;

describe("canvas event lookup", () => {
  it("returns the first list's event on an overlap, by whole cell", () => {
    expect(firstEventAt(lists, { x: 1, y: 1 })).toEqual({ kind: "object", index: 0 });
    expect(firstEventAt(lists, { x: 2, y: 2 })).toEqual({ kind: "warp", index: 0 });
    expect(firstEventAt(lists, { x: 0, y: 0 })).toBeNull();
  });
  it("resolves a ref to its position, null when absent", () => {
    expect(eventAt(lists, { kind: "warp", index: 1 })).toEqual({ x: 1, y: 1 });
    expect(eventAt(lists, { kind: "warp", index: 5 })).toBeNull();
    expect(eventAt(lists, null)).toBeNull();
  });
});
