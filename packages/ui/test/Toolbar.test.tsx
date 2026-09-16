import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "../src/components/Toolbar.js";

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
  };

  it("renders one button per tool (pencil, rect, bucket, dropper, shift, collision) and marks the active one aria-pressed", () => {
    render(<Toolbar {...baseProps} />);
    expect(screen.getByRole("button", { name: "pencil" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rect" }).getAttribute("aria-pressed")).toBe("false");
    for (const name of ["pencil", "rect", "bucket", "dropper", "shift", "collision"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("clicking a tool button calls onSelectTool with that tool's kind", () => {
    const onSelectTool = vi.fn();
    render(<Toolbar {...baseProps} onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole("button", { name: "bucket" }));
    expect(onSelectTool).toHaveBeenCalledWith("bucket");
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
});
