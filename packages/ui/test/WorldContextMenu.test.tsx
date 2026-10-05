import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorldContextMenu, clampMenuPosition } from "../src/components/WorldContextMenu.js";

const VIEWPORT = { w: 200, h: 200 };

describe("world context menu viewport bounds", () => {
  it("uses the measured popup width and height at the midpoint and far corner", () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("world-context-menu")) {
        const left = Number.parseFloat(this.style.left) || 0;
        const top = Number.parseFloat(this.style.top) || 0;
        return { x: left, y: top, left, top, right: left + 130, bottom: top + 50, width: 130, height: 50, toJSON() {} } as DOMRect;
      }
      return originalRect.call(this);
    });
    try {
      const items = [{ label: "Accept conflict", onSelect: () => {} }];
      const mounted = render(<WorldContextMenu menu={{ x: 100, y: 100, items }} viewport={VIEWPORT} onClose={() => {}} />);
      const popup = mounted.container.querySelector(".world-context-menu") as HTMLElement;
      expect(popup.style.left).toBe("62px");
      expect(popup.style.top).toBe("100px");
      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);

      mounted.rerender(<WorldContextMenu menu={{ x: 195, y: 195, items }} viewport={VIEWPORT} onClose={() => {}} />);
      expect(popup.style.left).toBe("62px");
      expect(popup.style.top).toBe("142px");
      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);
      expect(clampMenuPosition({ x: 100, y: 100 }, VIEWPORT, { w: 130, h: 50 })).toEqual({ x: 62, y: 100 });
    } finally { spy.mockRestore(); }
  });
});

function items(onSelect = vi.fn()) {
  return [
    { label: "Open in Map view", onSelect },
    { label: "Edit here", disabled: true, hint: "GBC editing arrives with Plan 7" },
    { label: "Accept conflict", onSelect },
  ];
}

describe("WorldContextMenu", () => {
  it("renders nothing without a menu", () => {
    const mounted = render(<WorldContextMenu menu={null} viewport={VIEWPORT} onClose={() => {}} />);
    expect(mounted.container.querySelector(".world-context-menu")).toBeNull();
  });

  it("renders menuitems; a disabled item is aria-disabled and shows its hint in its accessible name", () => {
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={() => {}} />);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    const edit = screen.getByRole("menuitem", { name: /Edit here/ }) as HTMLButtonElement;
    expect(edit.getAttribute("aria-disabled")).toBe("true");
    expect(edit.disabled).toBe(true);
    expect(edit.textContent).toContain("GBC editing arrives with Plan 7");
    expect(screen.getByRole("menuitem", { name: "Edit here GBC editing arrives with Plan 7" })).toBe(edit);
    expect((screen.getByRole("menuitem", { name: "Open in Map view" }) as HTMLButtonElement).getAttribute("aria-disabled")).toBeNull();
  });

  it("focuses the first enabled item on open", () => {
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: [{ label: "Off", disabled: true }, { label: "On", onSelect: () => {} }] }} viewport={VIEWPORT} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "On" }));
  });

  it("ArrowDown/ArrowUp cycle over the enabled items and skip disabled ones", () => {
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={() => {}} />);
    const open = screen.getByRole("menuitem", { name: "Open in Map view" });
    const accept = screen.getByRole("menuitem", { name: "Accept conflict" });
    expect(document.activeElement).toBe(open);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(accept); // "Edit here" is skipped
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(open); // wraps
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(accept); // wraps backwards, skipping "Edit here" on the way
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(open);
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting an enabled item calls onSelect, then onClose", () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push("close"));
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items(vi.fn(() => order.push("select"))) }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Accept conflict" }));
    expect(order).toEqual(["select", "close"]);
  });

  it("a keepOpen item leaves closing to its own onSelect", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: [{ label: "Accept conflict", onSelect, keepOpen: true }] }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Accept conflict" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking a disabled item does nothing", () => {
    const onClose = vi.fn();
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit here/ }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a pointerdown outside closes; one inside does not", () => {
    const onClose = vi.fn();
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Open in Map view" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a wheel outside closes", () => {
    const onClose = vi.fn();
    render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.wheel(document.body, { deltaY: 10 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops listening once closed", () => {
    const onClose = vi.fn();
    const mounted = render(<WorldContextMenu menu={{ x: 10, y: 10, items: items() }} viewport={VIEWPORT} onClose={onClose} />);
    mounted.rerender(<WorldContextMenu menu={null} viewport={VIEWPORT} onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
