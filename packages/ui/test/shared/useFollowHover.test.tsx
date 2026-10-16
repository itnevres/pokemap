import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, act, screen } from "@testing-library/react";
import { useFollowHover, FOLLOW_HOVER_KEY } from "../../src/shared/useFollowHover.js";
import { FollowHoverSwitch } from "../../src/shared/FollowHoverSwitch.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useFollowHover (Plan 9 R4)", () => {
  it("FollowHoverSwitch: the pill holds only its thumb; the label sits beside it (Plan 9 Task 12 F3)", () => {
    render(<FollowHoverSwitch on={true} onChange={() => {}} />);
    const toggle = screen.getByRole("switch", { name: "Follow hover" });
    expect(toggle.textContent).toBe("");
    expect(toggle.querySelector(".world-canvas__switch-thumb")).not.toBeNull();
    expect(toggle.nextElementSibling?.textContent).toBe("Follow hover");
  });
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
