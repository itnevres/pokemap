import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar, type ToolKind } from "../src/components/Toolbar.js";

const ALL_TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision", "sign"];

// No @testing-library/jest-dom in this repo (confirmed: no matcher
// extension anywhere under packages/ui/test) -- toHaveAttribute/
// toBeDisabled/toBeEnabled/toBeInTheDocument are not real matchers here.
// Every assertion below reads the DOM directly instead, mirroring
// CollisionPalette.test.tsx's own `.getAttribute("aria-pressed")` and
// MetatilePalette.test.tsx's own established convention.

describe("Toolbar", () => {
  const baseProps = {
    activeToolKind: "pencil" as const,
    onSelectTool: vi.fn(),
    isDirty: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
    onOpenSave: vi.fn(),
    onDiscard: vi.fn(),
    onOpenSignComposer: vi.fn(),
    // Every tool available by default -- these tests exercise rendering/
    // selection/undo-redo/dirty concerns, orthogonal to availability. The
    // availability-specific behaviour has its own dedicated tests below.
    availableTools: ALL_TOOLS,
  };

  it("renders one button per tool (including Sign) and marks the active one aria-pressed", () => {
    render(<Toolbar {...baseProps} />);
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Rect" }).getAttribute("aria-pressed")).toBe("false");
    for (const name of ["Pencil", "Rect", "Bucket", "Dropper", "Shift", "Collision", "Sign"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("clicking a tool button calls onSelectTool with that tool's kind", () => {
    const onSelectTool = vi.fn();
    render(<Toolbar {...baseProps} onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole("button", { name: "Bucket" }));
    expect(onSelectTool).toHaveBeenCalledWith("bucket");
  });

  it("G selects the Sign tool", () => {
    const onSelectTool = vi.fn();
    render(<Toolbar {...baseProps} activeToolKind={null} onSelectTool={onSelectTool} />);
    fireEvent.keyDown(window, { key: "g" });
    expect(onSelectTool).toHaveBeenCalledWith("sign");
    expect(screen.getByRole("button", { name: "Sign" }).getAttribute("title")).toBe("Sign (G)");
  });

  it("undo/redo buttons are disabled when canUndo/canRedo are false, enabled and clickable otherwise", () => {
    const onUndo = vi.fn();
    const { rerender } = render(<Toolbar {...baseProps} />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Toolbar {...baseProps} canUndo={true} onUndo={onUndo} />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("shows a dirty indicator only when isDirty is true, and the Save button is disabled when not dirty", () => {
    const { rerender } = render(<Toolbar {...baseProps} isDirty={false} />);
    expect(screen.queryByTestId("dirty-indicator")).toBeNull();
    expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Toolbar {...baseProps} isDirty={true} />);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking the Save button calls onOpenSave", () => {
    const onOpenSave = vi.fn();
    render(<Toolbar {...baseProps} isDirty={true} onOpenSave={onOpenSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onOpenSave).toHaveBeenCalled();
  });

  // Plan 2 follow-up 5: Discard Changes -- gated on isDirty the same
  // "nothing to act on" posture as Save above, but its own separate button.
  it("Discard Changes is disabled when not dirty, enabled and calls onDiscard when dirty", () => {
    const onDiscard = vi.fn();
    const { rerender } = render(<Toolbar {...baseProps} isDirty={false} onDiscard={onDiscard} />);
    expect((screen.getByRole("button", { name: "Discard Changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(onDiscard).not.toHaveBeenCalled();

    rerender(<Toolbar {...baseProps} isDirty={true} onDiscard={onDiscard} />);
    expect((screen.getByRole("button", { name: "Discard Changes" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  // Task 17: Add Sign is a one-shot composer flow (opens SignComposer), not
  // a paint tool -- separate from TOOLS and never gated by availableTools,
  // so it should be enabled and clickable regardless of what's available.
  it("clicking Add Sign calls onOpenSignComposer", () => {
    const onOpenSignComposer = vi.fn();
    render(<Toolbar {...baseProps} availableTools={[]} onOpenSignComposer={onOpenSignComposer} />);
    const btn = screen.getByRole("button", { name: "Add Sign" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onOpenSignComposer).toHaveBeenCalled();
  });

  // Code-review fix: pencil/rect/bucket/dropper/shift used to render fully
  // active/clickable while resolving to a no-op MapCanvas activeTool --
  // indistinguishable from a genuinely working tool. Only tools named in
  // `availableTools` should look and behave clickable.
  describe("tool availability", () => {
    const onSelectTool = vi.fn();

    it("disables every tool not in availableTools, and leaves available ones enabled", () => {
      render(<Toolbar {...baseProps} activeToolKind={null} availableTools={["collision"]} />);
      for (const name of ["Pencil", "Rect", "Bucket", "Dropper", "Shift", "Sign"]) {
        expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
      }
      expect((screen.getByRole("button", { name: "Collision" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("clicking a disabled (unavailable) tool never calls onSelectTool", () => {
      onSelectTool.mockClear();
      render(<Toolbar {...baseProps} activeToolKind={null} availableTools={["collision"]} onSelectTool={onSelectTool} />);
      fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
      expect(onSelectTool).not.toHaveBeenCalled();
    });

    it("clicking an available tool still calls onSelectTool", () => {
      onSelectTool.mockClear();
      render(<Toolbar {...baseProps} activeToolKind={null} availableTools={["collision"]} onSelectTool={onSelectTool} />);
      fireEvent.click(screen.getByRole("button", { name: "Collision" }));
      expect(onSelectTool).toHaveBeenCalledWith("collision");
    });
  });

  describe("Toolbar -- icon, label and tooltip (Plan 9 D5)", () => {
    it("each tool shows an aria-hidden icon and its capitalised label, tooltip names the shortcut", () => {
      render(<Toolbar {...baseProps} availableTools={ALL_TOOLS} />);
      const expected = [["Pencil", "P"], ["Rect", "R"], ["Bucket", "B"], ["Dropper", "I"], ["Shift", "S"], ["Collision", "C"], ["Sign", "G"]];
      for (const [label, key] of expected) {
        const btn = screen.getByRole("button", { name: label });
        expect(btn.getAttribute("title")).toBe(`${label} (${key})`);
        expect(btn.textContent).toBe(label);
        const svg = btn.querySelector("svg")!;
        expect(svg.getAttribute("aria-hidden")).toBe("true");
      }
    });
    it("a disabled tool keeps its reason title instead of the shortcut", () => {
      render(<Toolbar {...baseProps} availableTools={[]} unavailableTitle="this map's .blk is flagged non-writable: x" />);
      expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("title")).toBe("this map's .blk is flagged non-writable: x");
    });
    it("Undo and Redo tooltips name their shortcuts", () => {
      render(<Toolbar {...baseProps} />);
      expect(screen.getByRole("button", { name: "Undo" }).getAttribute("title")).toBe("Undo (Ctrl+Z)");
      expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe("Redo (Ctrl+Y)");
    });
  });
});
