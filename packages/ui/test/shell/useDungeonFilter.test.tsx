import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDungeonFilter } from "../../src/shell/useDungeonFilter.js";
import type { Dungeon } from "../../src/hooks/useDungeons.js";

const d = (maps: string[], id = "d1") => ({ id, name: "D", maps }) as unknown as Dungeon;
const mount = (dungeon: Dungeon | null, cache: boolean) =>
  renderHook(({ dg, c }) => useDungeonFilter(dg, c), { initialProps: { dg: dungeon, c: cache } });

describe("useDungeonFilter (Plan 9)", () => {
  it("null dungeon gives null", () => {
    expect(mount(null, false).result.current).toBeNull();
    expect(mount(null, true).result.current).toBeNull();
  });
  it("without the cache, a new dungeon object re-mints the filter (GBA: a rename refits)", () => {
    const { result, rerender } = mount(d(["A", "B"]), false);
    const first = result.current;
    rerender({ dg: d(["A", "B"]), c: false });
    expect(result.current).not.toBe(first);
    expect([...result.current!].sort()).toEqual(["A", "B"]);
  });
  it("with the cache, the same id and members keep the filter identity, in any order", () => {
    const { result, rerender } = mount(d(["A", "B"]), true);
    const first = result.current;
    rerender({ dg: d(["B", "A"]), c: true });
    expect(result.current).toBe(first);
  });
  it("with the cache, a membership change or another id re-mints", () => {
    const { result, rerender } = mount(d(["A", "B"]), true);
    const first = result.current;
    rerender({ dg: d(["A", "B", "C"]), c: true });
    expect(result.current).not.toBe(first);
    const second = result.current;
    rerender({ dg: d(["A", "B", "C"], "d2"), c: true });
    expect(result.current).not.toBe(second);
  });
  it("with the cache, closing the dungeon drops the cache", () => {
    const { result, rerender } = mount(d(["A"]), true);
    const first = result.current;
    rerender({ dg: null, c: true });
    rerender({ dg: d(["A"]), c: true });
    expect(result.current).not.toBe(first);
  });
});
