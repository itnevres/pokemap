import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
 * wheel, on Escape or Tab, and after a selection. The caller's `onClose` also
 * refocuses its canvas.
 */
export function WorldContextMenu({ menu, viewport, onClose }: { menu: WorldMenuState | null; viewport: Size; onClose(): void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Listeners subscribe once per open, not per canvas render: they call the latest onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = menu !== null;
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
    if (!open) return;
    const outside = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node | null)) onCloseRef.current();
    };
    // preventDefault: the Escape is spent here, so another Escape listener (the world canvas's in-context exit) skips it.
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("wheel", outside, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("wheel", outside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  if (!menu) return null;
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const enabled = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED)];
    if (enabled.length === 0) return;
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    enabled[(at + step + enabled.length) % enabled.length]!.focus();
  };
  return <div
    ref={menuRef}
    className="world-context-menu"
    role="menu"
    aria-label="Map actions"
    style={{ left: position.x, top: position.y }}
    onKeyDown={onMenuKeyDown}
    onContextMenu={(event) => event.preventDefault()}
  >
    {menu.items.map((item) => (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        className="world-context-menu__item"
        disabled={item.disabled}
        aria-disabled={item.disabled ? "true" : undefined}
        onClick={() => {
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

/** A native `contextmenu` this soon after our own keyboard open is the browser's echo of the same key press. */
const KEYBOARD_ECHO_MS = 1000;

/** The ContextMenu key, or Shift+F10 (never plain F10). */
const isMenuKey = (e: { key: string; shiftKey: boolean }) => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);

interface MenuBadge { key: string; accepted: boolean }

export interface WorldContextMenuOptions {
  canvasRef: { current: HTMLElement | null };
  /** Unset: "Open in Map view" is not offered. */
  onOpenMap?: (name: string) => void;
  /** The "Edit here" item for a map (GBA: enabled, only when wired; GBC: disabled with a hint). Unset: none. */
  editItem?: (map: string) => WorldMenuItem;
  /** The acceptance hook's `toggle`: resolves true once the server confirmed. */
  toggle: (key: string, accepted: boolean) => Promise<boolean>;
}

/**
 * The menu state and event glue both world canvases share; each canvas keeps its own hit test, its map-centre
 * computation and its "Edit here" item. Items are built at open time and read the latest options through a ref
 * (a menu outlives App renders). Items in order: Open in Map view, Edit here, then the conflict toggle.
 * The conflict item keeps the menu open until the POST succeeds, and a late success closes only the menu that
 * issued it.
 */
export function useWorldContextMenu(options: WorldContextMenuOptions) {
  const [menu, setMenu] = useState<WorldMenuState | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const menuId = useRef(0);
  // Chromium (live-measured) fires a `contextmenu` on keyup at the canvas centre, `button: -1`, even when the
  // ContextMenu key's keydown was prevented. It would hit-test the wrong point and replace or close the menu the
  // key just opened, so the next one within KEYBOARD_ECHO_MS is swallowed; any canvas pointerdown disarms it, so a
  // real mouse right-click (pointerdown first) is never swallowed.
  const keyboardOpenedAt = useRef<number | null>(null);

  const close = useCallback(() => {
    menuId.current++;
    setMenu(null);
    latest.current.canvasRef.current?.focus();
  }, []);

  const openFor = (x: number, y: number, map: string | null, badge: MenuBadge | null) => {
    const id = ++menuId.current;
    const items: WorldMenuItem[] = [];
    if (map && latest.current.onOpenMap) items.push({ label: "Open in Map view", onSelect: () => latest.current.onOpenMap?.(map) });
    const edit = map ? latest.current.editItem?.(map) : undefined;
    if (edit) items.push(edit);
    if (badge) {
      items.push({
        label: badge.accepted ? "Un-accept conflict" : "Accept conflict",
        keepOpen: true,
        onSelect: () => {
          void latest.current.toggle(badge.key, !badge.accepted).then((ok) => { if (ok && menuId.current === id) close(); });
        },
      });
    }
    setMenu(items.length > 0 ? { x, y, items } : null);
  };

  /** Canvas `onContextMenu`: `resolve` hit-tests a canvas-relative point. */
  const onContextMenu = (e: React.MouseEvent<HTMLElement>, resolve: (sx: number, sy: number) => { map: string | null; badge: MenuBadge | null }) => {
    e.preventDefault();
    if (keyboardOpenedAt.current !== null && e.timeStamp - keyboardOpenedAt.current < KEYBOARD_ECHO_MS) {
      keyboardOpenedAt.current = null;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { map, badge } = resolve(sx, sy);
    openFor(sx, sy, map, badge);
  };

  /** Canvas `onKeyDown`: true when `e` was the menu key (so the caller stops). `target` is the selected map's centre, if any. */
  const onMenuKey = (e: React.KeyboardEvent<HTMLElement>, target: () => { x: number; y: number; map: string } | null): boolean => {
    if (!isMenuKey(e)) return false;
    const t = target();
    if (t) {
      e.preventDefault();
      keyboardOpenedAt.current = e.timeStamp;
      openFor(t.x, t.y, t.map, null);
    }
    return true;
  };

  /** Canvas `onPointerDown`. */
  const onPointerDown = () => { keyboardOpenedAt.current = null; };

  return { menu, close, openFor, onContextMenu, onMenuKey, onPointerDown };
}
