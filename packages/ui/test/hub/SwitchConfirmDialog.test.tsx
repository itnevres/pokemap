import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SwitchConfirmDialog } from "../../src/hub/SwitchConfirmDialog.js";

// No @testing-library/jest-dom (see SaveDialog.test.tsx's own comment) --
// plain DOM reads throughout.

describe("SwitchConfirmDialog", () => {
  it("renders exactly the dirty map names", () => {
    render(<SwitchConfirmDialog dirtyMaps={["Route1", "Route2"]} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Route1", "Route2"]);
  });

  it("focuses Cancel on mount and calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(<SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={onCancel} onConfirm={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("owns no backdrop or modal shell -- it always sits inside its caller's own panel", () => {
    const { container } = render(<SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(container.querySelector(".warp-modal__backdrop")).toBeNull();
    expect(container.querySelector(".warp-modal__panel")).toBeNull();
    expect(container.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it("Escape is stopped here -- it never bubbles to an enclosing modal's own Escape handler", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={vi.fn()} onConfirm={vi.fn()} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(outer).not.toHaveBeenCalled();
  });

  it("is labelled 'Unsaved edits'", () => {
    render(<SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("alertdialog").getAttribute("aria-label")).toBe("Unsaved edits");
  });

  it("clicking Cancel calls onCancel without ever calling onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking Discard and switch disables the danger button while in flight and re-enables on failure, showing the error", async () => {
    let resolve: (v: string | null) => void = () => {};
    const onConfirm = vi.fn(() => new Promise<string | null>((r) => { resolve = r; }));
    render(<SwitchConfirmDialog dirtyMaps={["Route1"]} onCancel={vi.fn()} onConfirm={onConfirm} />);

    const btn = screen.getByRole("button", { name: /discard and switch/i }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);

    resolve("open failed: disk error");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/disk error/));
    expect((screen.getByRole("button", { name: /discard and switch/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
