import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwitchPromptDialog } from "../../src/shared/SwitchPromptDialog.js";

describe("SwitchPromptDialog", () => {
  it("labels the modal, focuses Cancel, and routes each action", () => {
    const onSave = vi.fn(), onDiscard = vi.fn(), onCancel = vi.fn();
    render(<SwitchPromptDialog mapName="Route1" busy={false} {...{ onSave, onDiscard, onCancel }} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("You have unsaved changes on Route1.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    for (const name of ["Save", "Discard", "Cancel"]) fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
  it("disables all actions and Escape while busy", () => {
    const onSave = vi.fn(), onDiscard = vi.fn(), onCancel = vi.fn();
    render(<SwitchPromptDialog mapName="Route1" busy {...{ onSave, onDiscard, onCancel }} />);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
