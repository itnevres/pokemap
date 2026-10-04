import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConflictAction, clampConflictAction } from "../../src/world/ConflictAction.js";

describe("conflict action viewport bounds", () => {
  it("uses the measured popup width and height at the midpoint and far corner", () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("world-canvas__conflict-action")) {
        const left = Number.parseFloat(this.style.left) || 0;
        const top = Number.parseFloat(this.style.top) || 0;
        return { x: left, y: top, left, top, right: left + 130, bottom: top + 50, width: 130, height: 50, toJSON() {} } as DOMRect;
      }
      return originalRect.call(this);
    });
    try {
      const viewport = { w: 200, h: 200 };
      const action = { key: "k", accepted: false, x: 100, y: 100 };
      const mounted = render(<ConflictAction action={action} viewport={viewport} onSave={() => {}} />);
      const popup = mounted.container.querySelector(".world-canvas__conflict-action") as HTMLElement;
      expect(popup.style.left).toBe("62px");
      expect(popup.style.top).toBe("100px");
      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);

      mounted.rerender(<ConflictAction action={{ ...action, x: 195, y: 195 }} viewport={viewport} onSave={() => {}} />);
      expect(popup.style.left).toBe("62px");
      expect(popup.style.top).toBe("142px");
      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);
      expect(clampConflictAction({ x: 100, y: 100 }, viewport, { w: 130, h: 50 })).toEqual({ x: 62, y: 100 });
    } finally { spy.mockRestore(); }
  });
});
