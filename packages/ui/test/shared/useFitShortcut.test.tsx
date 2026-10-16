import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useFitShortcut } from "../../src/shared/useFitShortcut.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

describe("useFitShortcut (Plan 9 R5)", () => {
  it("f fits once and prevents the default, under StrictMode", () => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, true), { reactStrictMode: true });
    const ev = press("f");
    expect(fit).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });
  it("calls the latest fit after a rerender", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(({ fit }) => useFitShortcut(fit, true), { initialProps: { fit: a } });
    rerender({ fit: b });
    press("f");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it("does nothing while disabled, and stops listening on unmount", () => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, false));
    press("f");
    const { unmount } = renderHook(() => useFitShortcut(fit, true));
    unmount();
    press("f");
    expect(fit).not.toHaveBeenCalled();
  });
  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
    ["Shift", { shiftKey: true, key: "F" }],
  ] as const)("ignores f with %s held", (_name, init) => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, true));
    const ev = press("f", init);
    expect(fit).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
  it("ignores f typed in an input", () => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, true));
    const input = document.body.appendChild(document.createElement("input"));
    press("f", {}, input);
    expect(fit).not.toHaveBeenCalled();
  });
  it("ignored while an aria-modal dialog is open", () => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, true));
    document.body.appendChild(document.createElement("div")).setAttribute("aria-modal", "true");
    press("f");
    expect(fit).not.toHaveBeenCalled();
  });
  it("ignores a keydown another handler already prevented", () => {
    const fit = vi.fn();
    renderHook(() => useFitShortcut(fit, true));
    const el = document.body.appendChild(document.createElement("div"));
    el.addEventListener("keydown", (e) => e.preventDefault());
    press("f", {}, el);
    expect(fit).not.toHaveBeenCalled();
  });
});
