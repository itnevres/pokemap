import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContextEditing, type UseContextEditingArgs } from "../../src/shared/useContextEditing.js";

function args(): UseContextEditingArgs {
  return { selected: "A", session: { isDirty: false, markClean: vi.fn() }, leave: vi.fn((go) => go()),
    select: vi.fn(), openSave: vi.fn(), strokeSettled: vi.fn(() => Promise.resolve()) };
}
const flush = () => act(async () => {});

describe("useContextEditing", () => {
  it("guards another-map entry and bypasses leave and select for the selected map", () => {
    const a = args();
    a.leave = vi.fn();
    const { result } = renderHook(() => useContextEditing(a));
    act(() => result.current.enter("B"));
    expect(a.leave).toHaveBeenCalledTimes(1);
    expect(a.select).not.toHaveBeenCalled();
    expect(result.current.contextMap).toBeNull();
    act(() => result.current.enter("A"));
    expect(result.current.contextMap).toBe("A");
    expect(a.leave).toHaveBeenCalledTimes(1);
    expect(a.select).not.toHaveBeenCalled();
  });

  it("selects another map inside the accepted guard", () => {
    const a = args();
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => { result.current.enter("B"); rerender({ ...a, selected: "B" }); });
    expect(a.select).toHaveBeenCalledWith("B");
    expect(result.current.contextMap).toBe("B");
  });

  it("dirty exit opens the family dialog and Cancel keeps context; clean exit leaves", async () => {
    const a = args();
    a.session.isDirty = true;
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    act(() => result.current.requestExit());
    await flush();
    expect(a.openSave).toHaveBeenCalledTimes(1);
    expect(result.current.contextMap).toBe("A"); // Cancelling the family-owned dialog changes no hook state.
    rerender({ ...a, session: { ...a.session, isDirty: false } });
    act(() => result.current.requestExit());
    await flush();
    expect(result.current.contextMap).toBeNull();
  });

  it("commit marks clean and bumps only the selected context map, and nothing outside context", () => {
    const a = args();
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    act(() => result.current.onCommitted());
    expect(result.current.tileVersions).toEqual({ A: 1 });
    act(() => result.current.leaveContext());
    rerender({ ...a, selected: "B" });
    act(() => result.current.enter("B"));
    act(() => result.current.onCommitted());
    expect(result.current.tileVersions).toEqual({ A: 1, B: 1 });
    act(() => result.current.leaveContext());
    act(() => result.current.onCommitted());
    expect(result.current.tileVersions).toEqual({ A: 1, B: 1 });
    expect(a.session.markClean).toHaveBeenCalledTimes(3);
  });

  it("mode switch leaves without calling the guard or opening SaveDialog", async () => {
    const a = args(); a.session.isDirty = true;
    const { result } = renderHook(() => useContextEditing(a));
    act(() => result.current.enter("A"));
    act(() => result.current.leaveContext());
    await flush();
    expect(result.current.contextMap).toBeNull();
    expect(a.leave).not.toHaveBeenCalled();
    expect(a.openSave).not.toHaveBeenCalled();
  });

  it("selection moving away leaves context", () => {
    const a = args();
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    rerender({ ...a, selected: "B" });
    expect(result.current.contextMap).toBeNull();
  });

  it.each([true, false])("M5 waits for held strokes, then decides with post-render dirty=%s once", async (dirty) => {
    const a = args(); let release!: () => void;
    a.strokeSettled = () => new Promise<void>((resolve) => { release = resolve; });
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    act(() => { result.current.requestExit(); result.current.requestExit(); });
    await flush();
    expect(a.openSave).not.toHaveBeenCalled();
    expect(result.current.contextMap).toBe("A");
    rerender({ ...a, session: { ...a.session, isDirty: dirty } });
    await act(async () => { release(); });
    expect(a.openSave).toHaveBeenCalledTimes(dirty ? 1 : 0);
    expect(result.current.contextMap).toBe(dirty ? "A" : null);
  });

  it("a pending exit does nothing after a mode switch", async () => {
    const a = args(); let release!: () => void;
    a.strokeSettled = () => new Promise<void>((resolve) => { release = resolve; });
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    act(() => result.current.requestExit());
    act(() => result.current.leaveContext());
    rerender({ ...a, session: { ...a.session, isDirty: true } });
    await act(async () => { release(); });
    expect(result.current.contextMap).toBeNull();
    expect(a.openSave).not.toHaveBeenCalled();
  });
  it("a mode switch retires the held exit even if context is reentered before it settles", async () => {
    const a = args(); let release!: () => void;
    a.strokeSettled = () => new Promise<void>((resolve) => { release = resolve; });
    const { result, rerender } = renderHook((p) => useContextEditing(p), { initialProps: a });
    act(() => result.current.enter("A"));
    act(() => result.current.requestExit());
    act(() => result.current.leaveContext());
    act(() => result.current.enter("A"));
    rerender({ ...a, session: { ...a.session, isDirty: true } });
    await act(async () => { release(); });
    expect(result.current.contextMap).toBe("A");
    expect(a.openSave).not.toHaveBeenCalled();
  });

});
