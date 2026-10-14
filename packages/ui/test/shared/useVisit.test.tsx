import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useVisit } from "../../src/shared/useVisit.js";

describe("useVisit", () => {
  it("reports a new key before children can receive the previous visit state", () => {
    const changes: boolean[] = [];
    const childValues: Array<string | null> = [];
    function Child({ value }: { value: string | null }) { childValues.push(value); return null; }
    function Host({ visitKey }: { visitKey: string }) {
      const visit = useVisit(visitKey);
      const [pick, setPick] = useState<string | null>("picked");
      changes.push(visit.changed);
      if (visit.changed) setPick(null);
      return <Child value={pick} />;
    }
    const { rerender } = render(<Host visitKey="A" />);
    rerender(<Host visitKey="B" />);

    expect(changes).toEqual([false, true, false]);
    expect(childValues).toEqual(["picked", null]);
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
