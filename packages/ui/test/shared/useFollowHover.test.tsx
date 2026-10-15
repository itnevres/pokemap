import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFollowHover, FOLLOW_HOVER_KEY } from "../../src/shared/useFollowHover.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useFollowHover (Plan 9 R4)", () => {
  it("defaults to on", () => {
    expect(renderHook(() => useFollowHover()).result.current[0]).toBe(true);
  });
  it("remembers off across mounts", () => {
    const first = renderHook(() => useFollowHover());
    act(() => first.result.current[1](false));
    expect(localStorage.getItem(FOLLOW_HOVER_KEY)).toBe("off");
    first.unmount();
    expect(renderHook(() => useFollowHover()).result.current[0]).toBe(false);
  });
  it("falls back to on, and still toggles, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useFollowHover());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
