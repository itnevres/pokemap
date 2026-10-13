import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVisit } from "../../src/shared/useVisit.js";

describe("useVisit", () => {
  it("reports a new key before children can receive the previous visit state", () => {
    const seen: Array<string | null> = [];
    const { result, rerender } = renderHook(({ key }) => {
      const visit = useVisit(key);
      const [pick, setPick] = useState<{ forMap: string | null; value: string | null }>({ forMap: key, value: "picked" });
      if (visit.changed) setPick({ forMap: key, value: null });
      seen.push(pick.forMap === key ? pick.value : null);
      return visit.changed;
    }, { initialProps: { key: "A" } });

    expect(result.current).toBe(false);
    rerender({ key: "B" });
    expect(result.current).toBe(false);
    expect(seen.at(-1)).toBeNull();
    expect(seen.slice(1)).not.toContain("picked");
  });

  it("retires captured guards across A to B and A to B to A", () => {
    const { result, rerender } = renderHook(({ key }) => useVisit(key), { initialProps: { key: "A" } });
    const firstA = result.current.isCurrent;
    expect(firstA()).toBe(true);
    rerender({ key: "B" });
    expect(firstA()).toBe(false);
    const b = result.current.isCurrent;
    expect(b()).toBe(true);
    rerender({ key: "A" });
    expect(firstA()).toBe(false);
    expect(b()).toBe(false);
    expect(result.current.isCurrent()).toBe(true);
  });

  it("retires a captured guard on unmount", () => {
    const { result, unmount } = renderHook(() => useVisit("A"));
    const guard = result.current.isCurrent;
    act(() => unmount());
    expect(guard()).toBe(false);
  });
});
