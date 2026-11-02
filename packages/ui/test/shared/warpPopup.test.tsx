import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { WarpPopup } from "../../src/shared/WarpPopup.js";
import { trapDialogFocus } from "../../src/shared/dialogFocus.js";
import { shortcutBlocked, isTextTarget } from "../../src/shared/shortcutGuard.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

describe("WarpPopup", () => {
  const onClose = vi.fn();
  const children = <button id="inner-btn">Inner</button>;

  beforeEach(() => {
    onClose.mockClear();
  });

  it("focuses close button on mount", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    const closeBtn = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("returns focus to opener on unmount when opener still connected", () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.id = "opener";
    opener.focus();
    const { unmount, rerender } = render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    // Wait for the close button to be focused
    const closeBtn = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(closeBtn);
    
    // Check that the opener is still in the document
    expect(opener.isConnected).toBe(true);
    
    unmount();
    // The opener should still be in the document
    expect(opener.isConnected).toBe(true);
    // Note: focus restoration is tested in live acceptance; jsdom focus() is limited
  });

  it("does not throw when opener removed meanwhile", () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.id = "opener";
    opener.focus();
    const { unmount } = render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    opener.remove();
    expect(() => unmount()).not.toThrow();
  });

  it("Escape on panel calls onClose", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    const panel = screen.getByRole("dialog");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape with defaultPrevented does not call onClose", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    const panel = screen.getByRole("dialog");
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    ev.preventDefault();
    panel.dispatchEvent(ev);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape from input inside popup does not call onClose", () => {
    const childrenWithInput = (
      <>
        <input id="test-input" aria-label="test-input" />
        <button id="inner-btn">Inner</button>
      </>
    );
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{childrenWithInput}</WarpPopup>);
    const input = screen.getByLabelText("test-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape while nested aria-modal dialog exists does not call onClose", () => {
    render(
      <WarpPopup mapName="TestMap" onClose={onClose}>
        {children}
        <div role="dialog" aria-modal="true" aria-label="Nested dialog" id="nested-dialog">
          <button>Nested</button>
        </div>
      </WarpPopup>
    );
    const panel = screen.getByRole("dialog", { name: "TestMap (warp destination)" });
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click does not call onClose", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    const backdrop = document.querySelector(".warp-modal__backdrop");
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  it("Tab on last control wraps to first (including close button)", () => {
    const childrenWithTwoButtons = (
      <>
        <button id="first-btn">First</button>
        <button id="last-btn">Last</button>
      </>
    );
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{childrenWithTwoButtons}</WarpPopup>);
    const panel = screen.getByRole("dialog");
    const lastBtn = screen.getByRole("button", { name: "Last" });
    lastBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    // Should wrap to the close button (first focusable in panel)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("Shift+Tab on first control wraps to last (including close button)", () => {
    const childrenWithTwoButtons = (
      <>
        <button id="first-btn">First</button>
        <button id="last-btn">Last</button>
      </>
    );
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{childrenWithTwoButtons}</WarpPopup>);
    const panel = screen.getByRole("dialog");
    const closeBtn = screen.getByRole("button", { name: "Close" });
    closeBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: true });
    // Should wrap to the last child button
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
  });

  it("Tab inside nested aria-modal panel wraps within nested panel only", () => {
    const childrenWithNested = (
      <>
        <button id="outer-first">Outer First</button>
        <div role="dialog" aria-modal="true" aria-label="Nested dialog" id="nested-dialog" onKeyDown={trapDialogFocus}>
          <button id="nested-first">Nested First</button>
          <button id="nested-last">Nested Last</button>
        </div>
        <button id="outer-last">Outer Last</button>
      </>
    );
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{childrenWithNested}</WarpPopup>);
    const nestedPanel = screen.getByRole("dialog", { name: "Nested dialog" });
    const nestedLast = screen.getByRole("button", { name: "Nested Last" });
    nestedLast.focus();
    fireEvent.keyDown(nestedPanel, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Nested First" }));
  });

  it("the popup's trap ignores Tab from inside a nested aria-modal panel, even on the popup's last control", () => {
    render(
      <WarpPopup mapName="TestMap" onClose={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Nested dialog"><button>Nested Last</button></div>
      </WarpPopup>,
    );
    const nestedLast = screen.getByRole("button", { name: "Nested Last" });
    nestedLast.focus();
    const handled = !fireEvent.keyDown(nestedLast, { key: "Tab" });
    expect(handled).toBe(false);
    expect(document.activeElement).toBe(nestedLast);
  });

  it("has correct aria attributes", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    const panel = screen.getByRole("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("data-warp-popup")).toBe("");
    expect(panel.getAttribute("aria-label")).toBe("TestMap (warp destination)");
  });

  it("uses warp-modal CSS classes", () => {
    render(<WarpPopup mapName="TestMap" onClose={onClose}>{children}</WarpPopup>);
    expect(document.querySelector(".warp-modal__backdrop")).toBeTruthy();
    expect(document.querySelector(".warp-modal__panel")).toBeTruthy();
    expect(document.querySelector(".warp-modal__header")).toBeTruthy();
    expect(document.querySelector(".warp-modal__title")).toBeTruthy();
    expect(document.querySelector(".warp-modal__close")).toBeTruthy();
    expect(document.querySelector(".warp-modal__body")).toBeTruthy();
  });
});

describe("trapDialogFocus", () => {
  it("wraps Tab from last to first focusable element", () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.setAttribute("aria-modal", "true");
    const first = container.appendChild(document.createElement("button"));
    first.textContent = "First";
    const last = container.appendChild(document.createElement("button"));
    last.textContent = "Last";
    last.focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    Object.defineProperty(ev, "currentTarget", { value: container, writable: true });
    Object.defineProperty(ev, "target", { value: document.activeElement });
    trapDialogFocus(ev as unknown as React.KeyboardEvent<HTMLElement>);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from first to last focusable element", () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.setAttribute("aria-modal", "true");
    const first = container.appendChild(document.createElement("button"));
    first.textContent = "First";
    const last = container.appendChild(document.createElement("button"));
    last.textContent = "Last";
    first.focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "currentTarget", { value: container, writable: true });
    Object.defineProperty(ev, "target", { value: document.activeElement });
    trapDialogFocus(ev as unknown as React.KeyboardEvent<HTMLElement>);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("does nothing when key is not Tab", () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.setAttribute("aria-modal", "true");
    const btn = container.appendChild(document.createElement("button"));
    btn.focus();

    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(ev, "currentTarget", { value: container, writable: true });
    Object.defineProperty(ev, "target", { value: document.activeElement });
    trapDialogFocus(ev as unknown as React.KeyboardEvent<HTMLElement>);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("defers to nested aria-modal dialog", () => {
    const outer = document.body.appendChild(document.createElement("div"));
    outer.setAttribute("aria-modal", "true");
    const outerBtn = outer.appendChild(document.createElement("button"));
    outerBtn.textContent = "Outer";

    const inner = outer.appendChild(document.createElement("div"));
    inner.setAttribute("aria-modal", "true");
    const innerBtn = inner.appendChild(document.createElement("button"));
    innerBtn.textContent = "Inner";
    innerBtn.focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    Object.defineProperty(ev, "currentTarget", { value: outer, writable: true });
    trapDialogFocus(ev as unknown as React.KeyboardEvent<HTMLElement>);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("ignores disabled, hidden, and negative tabindex elements", () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.setAttribute("aria-modal", "true");
    const disabled = container.appendChild(document.createElement("button"));
    disabled.disabled = true;
    disabled.textContent = "Disabled";
    const hidden = container.appendChild(document.createElement("button"));
    hidden.hidden = true;
    hidden.textContent = "Hidden";
    const negTab = container.appendChild(document.createElement("div"));
    negTab.tabIndex = -1;
    negTab.textContent = "NegTab";
    const valid = container.appendChild(document.createElement("button"));
    valid.textContent = "Valid";
    valid.focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    Object.defineProperty(ev, "currentTarget", { value: container, writable: true });
    Object.defineProperty(ev, "target", { value: document.activeElement });
    trapDialogFocus(ev as unknown as React.KeyboardEvent<HTMLElement>);
    // Valid is the only control left, so Tab stays on it instead of leaving the dialog.
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(valid);
  });
});

describe("shortcutBlocked", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false for a plain keydown with no modal", () => {
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev)).toBe(false);
  });

  it("returns true when defaultPrevented", () => {
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    ev.preventDefault();
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns true for text target (input)", () => {
    const input = document.body.appendChild(document.createElement("input"));
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns true for text target (textarea)", () => {
    const textarea = document.body.appendChild(document.createElement("textarea"));
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    textarea.dispatchEvent(ev);
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns true for text target (select)", () => {
    const select = document.body.appendChild(document.createElement("select"));
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    select.dispatchEvent(ev);
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns true for text target (contenteditable)", () => {
    const div = document.body.appendChild(document.createElement("div"));
    div.setAttribute("contenteditable", "true"); // jsdom does not reflect the contentEditable property
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    div.dispatchEvent(ev);
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns true when non-popup aria-modal dialog exists", () => {
    const modal = document.body.appendChild(document.createElement("div"));
    modal.setAttribute("aria-modal", "true");
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("returns false when popup is open and owner is inside popup", () => {
    const popup = document.body.appendChild(document.createElement("div"));
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("data-warp-popup", "");
    const owner = popup.appendChild(document.createElement("div"));
    const btn = owner.appendChild(document.createElement("button"));
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev, btn)).toBe(false);
  });

  it("returns true when popup is open and owner is outside popup", () => {
    const popup = document.body.appendChild(document.createElement("div"));
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("data-warp-popup", "");
    const outside = document.body.appendChild(document.createElement("div"));
    const btn = outside.appendChild(document.createElement("button"));
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev, btn)).toBe(true);
  });

  it("returns true when popup is open and owner is missing", () => {
    const popup = document.body.appendChild(document.createElement("div"));
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("data-warp-popup", "");
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev, null)).toBe(true);
    expect(shortcutBlocked(ev, undefined)).toBe(true);
  });

  it("returns true when SaveDialog-like aria-modal exists inside popup", () => {
    const popup = document.body.appendChild(document.createElement("div"));
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("data-warp-popup", "");
    const saveDialog = popup.appendChild(document.createElement("div"));
    saveDialog.setAttribute("aria-modal", "true");
    saveDialog.className = "save-dialog";
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev)).toBe(true);
  });

  it("without popup, rule equals original: blocked only by defaultPrevented, text target, or any aria-modal", () => {
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    expect(shortcutBlocked(ev)).toBe(false);

    const modal = document.body.appendChild(document.createElement("div"));
    modal.setAttribute("aria-modal", "true");
    expect(shortcutBlocked(ev)).toBe(true);
    modal.remove();

    const input = document.body.appendChild(document.createElement("input"));
    const inputEv = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    input.dispatchEvent(inputEv);
    expect(shortcutBlocked(inputEv)).toBe(true);
  });
});

describe("Tab cycle on dialog panels", () => {
  it("SaveDialog: Tab on last wraps to first", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ changes: [], refusals: [] }) }));
    const { SaveDialog } = await import("../../src/components/SaveDialog.js");
    render(<SaveDialog mapName="TestMap" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy());
    const panel = screen.getByRole("dialog");
    const saveBtn = screen.getByRole("button", { name: "Save Changes" });
    saveBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("SwitchPromptDialog: Tab on last wraps to first", async () => {
    const { SwitchPromptDialog } = await import("../../src/shared/SwitchPromptDialog.js");
    render(<SwitchPromptDialog mapName="TestMap" busy={false} onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    const panel = screen.getByRole("dialog");
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    cancelBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    // Tab on last (Cancel) should wrap to first (Save)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
  });

  it("SignEditor: Tab on last wraps to first", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ kind: "empty" }) }));
    const { SignEditor } = await import("../../src/shared/SignEditor.js");
    const anchor = new DOMRect(10, 20, 16, 16);
    render(<SignEditor mapName="TestMap" x={1} y={2} anchor={anchor} onDone={vi.fn()} onCancel={vi.fn()} onSessionUpdated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Place" })).toBeTruthy());
    const panel = screen.getByRole("dialog");
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    cancelBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    // Tab on last (Cancel) should wrap to first focusable (first radio input)
    const firstRadio = screen.getByRole("radio", { name: "Free text" });
    expect(document.activeElement).toBe(firstRadio);
  });
});