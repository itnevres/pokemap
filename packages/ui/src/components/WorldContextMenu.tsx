import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Size { w: number; h: number }
interface Point { x: number; y: number }

export interface WorldMenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Small visible text under the label; part of the accessible name. */
  hint?: string;
  /** The menu does not close after onSelect; the item's own handler closes it (a pending save that may fail). */
  keepOpen?: boolean;
}

export interface WorldMenuState { x: number; y: number; items: WorldMenuItem[] }

/** Keep the measured popup, including a small inset, within the canvas. */
export function clampMenuPosition(pointer: Point, viewport: Size, popup: Size, inset = 8): Point {
  const xInset = Math.min(inset, Math.max(0, (viewport.w - popup.w) / 2));
  const yInset = Math.min(inset, Math.max(0, (viewport.h - popup.h) / 2));
  return {
    x: Math.min(Math.max(pointer.x, xInset), Math.max(xInset, viewport.w - popup.w - xInset)),
    y: Math.min(Math.max(pointer.y, yInset), Math.max(yInset, viewport.h - popup.h - yInset)),
  };
}

const ENABLED = "button:not([disabled])";

/**
 * The world canvases' right-click / ContextMenu-key menu. Screen-anchored
 * inside the (position: relative) viewport; closes on an outside pointerdown or
 * wheel, on Escape, and after a selection. The caller's `onClose` also
 * refocuses its canvas.
 */
export function WorldContextMenu({ menu, viewport, onClose }: { menu: WorldMenuState | null; viewport: Size; onClose(): void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPosition(clampMenuPosition(menu, viewport, { w: rect.width, h: rect.height }));
  }, [menu, viewport.w, viewport.h]);
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLButtonElement>(ENABLED)?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node | null)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("wheel", outside, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("wheel", outside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const enabled = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED)];
    if (enabled.length === 0) return;
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    enabled[(at + step + enabled.length) % enabled.length]!.focus();
  };
  return <div ref={menuRef} className="world-context-menu" role="menu" style={{ left: position.x, top: position.y }} onKeyDown={onMenuKeyDown}>
    {menu.items.map((item) => (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        className="world-context-menu__item"
        disabled={item.disabled}
        aria-disabled={item.disabled ? "true" : undefined}
        onClick={() => {
          if (item.disabled) return;
          item.onSelect?.();
          if (!item.keepOpen) onClose();
        }}
      >
        {item.label}
        {item.hint && <>{" "}<small className="world-context-menu__hint">{item.hint}</small></>}
      </button>
    ))}
  </div>;
}
