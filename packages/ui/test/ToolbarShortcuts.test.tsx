import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Toolbar, type ToolbarProps, type ToolKind } from "../src/components/Toolbar.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const ALL: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];
const props = (over: Partial<ToolbarProps> = {}): ToolbarProps => ({
  activeToolKind: null, onSelectTool: vi.fn(), isDirty: false, onUndo: vi.fn(), onRedo: vi.fn(),
  canUndo: true, canRedo: true, onOpenSave: vi.fn(), onDiscard: vi.fn(), availableTools: ALL, ...over,
});
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

describe("Toolbar keyboard shortcuts (Plan 9 R1)", () => {
  it.each([["p", "pencil"], ["r", "rect"], ["b", "bucket"], ["i", "dropper"], ["s", "shift"], ["c", "collision"]] as const)(
    "%s selects %s and is prevented", (key, kind) => {
      const p = props();
      render(<Toolbar {...p} />);
      expect(press(key).defaultPrevented).toBe(true);
      expect(p.onSelectTool).toHaveBeenCalledWith(kind);
    });

  it("upper-case letters without Shift (Caps Lock) select too", () => {
    const p = props();
    render(<Toolbar {...p} />);
    press("P");
    expect(p.onSelectTool).toHaveBeenCalledWith("pencil");
  });

  it("Ctrl+Z and Cmd+Z undo; Ctrl+Y, Ctrl+Shift+Z and Cmd+Shift+Z redo", () => {
    const p = props();
    render(<Toolbar {...p} />);
    expect(press("z", { ctrlKey: true }).defaultPrevented).toBe(true);
    press("z", { metaKey: true });
    expect(p.onUndo).toHaveBeenCalledTimes(2);
    press("y", { ctrlKey: true });
    press("Z", { ctrlKey: true, shiftKey: true });
    press("z", { metaKey: true, shiftKey: true });
    expect(p.onRedo).toHaveBeenCalledTimes(3);
  });

  it("ignored in an input, textarea, select or contenteditable", () => {
    const p = props();
    render(<><Toolbar {...p} /><input aria-label="i" /><textarea aria-label="t" /><select aria-label="s" /><div contentEditable suppressContentEditableWarning>x</div></>);
    for (const el of [...document.querySelectorAll("input, textarea, select, [contenteditable]")]) {
      expect(press("p", {}, el).defaultPrevented).toBe(false);
      press("z", { ctrlKey: true }, el);
    }
    expect(p.onSelectTool).not.toHaveBeenCalled();
    expect(p.onUndo).not.toHaveBeenCalled();
  });

  it("ignored while an aria-modal dialog is open", () => {
    const p = props();
    render(<><Toolbar {...p} /><div role="dialog" aria-modal="true" /></>);
    press("p");
    press("z", { ctrlKey: true });
    expect(p.onSelectTool).not.toHaveBeenCalled();
    expect(p.onUndo).not.toHaveBeenCalled();
  });

  it("a letter with any modifier is ignored", () => {
    const p = props();
    render(<Toolbar {...p} />);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(press("p", mod).defaultPrevented).toBe(false);
    }
    expect(p.onSelectTool).not.toHaveBeenCalled();
  });

  it("an absent tool (GBC has no Collision) and a disabled tool are ignored", () => {
    const p = props({ tools: ["pencil", "rect", "bucket", "dropper", "shift"], availableTools: ["rect"] });
    render(<Toolbar {...p} />);
    expect(press("c").defaultPrevented).toBe(false);
    expect(press("p").defaultPrevented).toBe(false);
    expect(p.onSelectTool).not.toHaveBeenCalled();
    press("r");
    expect(p.onSelectTool).toHaveBeenCalledWith("rect");
  });

  it("Undo/Redo are ignored when unavailable", () => {
    const p = props({ canUndo: false, canRedo: false });
    render(<Toolbar {...p} />);
    expect(press("z", { ctrlKey: true }).defaultPrevented).toBe(false);
    press("y", { ctrlKey: true });
    expect(p.onUndo).not.toHaveBeenCalled();
    expect(p.onRedo).not.toHaveBeenCalled();
  });

  it("an already-prevented key is ignored", () => {
    const p = props();
    render(<Toolbar {...p} />);
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    ev.preventDefault();
    window.dispatchEvent(ev);
    expect(p.onSelectTool).not.toHaveBeenCalled();
  });

  it("uses the latest props without re-subscribing, and unmount removes the listener", () => {
    const p = props({ availableTools: [] });
    const { rerender, unmount } = render(<Toolbar {...p} />);
    rerender(<Toolbar {...p} availableTools={ALL} />);
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
    unmount();
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
  });

  it("StrictMode: one key press selects exactly once", () => {
    const p = props();
    render(<Toolbar {...p} />, { reactStrictMode: true });
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
  });
});
