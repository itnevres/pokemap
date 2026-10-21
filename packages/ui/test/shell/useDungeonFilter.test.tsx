import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDungeonFilter } from "../../src/shell/useDungeonFilter.js";
import type { Dungeon } from "../../src/hooks/useDungeons.js";

const d = (maps: string[], id = "d1") => ({ id, name: "D", maps }) as unknown as Dungeon;
const mount = (dungeon: Dungeon | null) =>
  renderHook(({ dg }) => useDungeonFilter(dg), { initialProps: { dg: dungeon } });

describe("useDungeonFilter (Plan 9)", () => {
  it("null dungeon gives null", () => {
    expect(mount(null).result.current).toBeNull();
  });
  it("a rename (a new dungeon object, same id and members) keeps the filter identity for both families (Plan 10b)", () => {
    const { result, rerender } = mount(d(["A", "B"]));
    const first = result.current;
    rerender({ dg: { ...d(["A", "B"]), name: "Renamed" } as unknown as Dungeon });
    expect(result.current).toBe(first);
    expect([...result.current!].sort()).toEqual(["A", "B"]);
  });
  it("the same id and members keep the filter identity, in any order", () => {
    const { result, rerender } = mount(d(["A", "B"]));
    const first = result.current;
    rerender({ dg: d(["B", "A"]) });
    expect(result.current).toBe(first);
  });
  it("a membership change or another id re-mints", () => {
    const { result, rerender } = mount(d(["A", "B"]));
    const first = result.current;
    rerender({ dg: d(["A", "B", "C"]) });
    expect(result.current).not.toBe(first);
    const second = result.current;
    rerender({ dg: d(["A", "B", "C"], "d2") });
    expect(result.current).not.toBe(second);
  });
  it("closing the dungeon drops the cache", () => {
    const { result, rerender } = mount(d(["A"]));
    const first = result.current;
    rerender({ dg: null });
    rerender({ dg: d(["A"]) });
    expect(result.current).not.toBe(first);
  });
});
