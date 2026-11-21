import { useRef, useState, type MouseEvent, type MouseEventHandler, type ReactNode } from "react";
import { WorldContextMenu, type WorldMenuState } from "../components/WorldContextMenu.js";

interface Cell { x: number; y: number }
interface MapContextMenuOptions {
  cellAt: (event: MouseEvent<HTMLCanvasElement>) => Cell | null;
  disabledReason: () => string | null;
  onEditBlock: (cell: Cell) => void;
  resetKey: string;
  viewport: { w: number; h: number };
  /** While true (event placement, R7): right-clicks open nothing and an open menu is closed. */
  suppressed?: boolean;
}

export function useMapContextMenu(options: MapContextMenuOptions): {
  onContextMenu: MouseEventHandler<HTMLCanvasElement>; element: ReactNode;
} {
  const latest = useRef(options);
  latest.current = options;
  const [menu, setMenu] = useState<WorldMenuState | null>(null);
  const [resetKey, setResetKey] = useState(options.resetKey);
  if (resetKey !== options.resetKey) {
    setResetKey(options.resetKey);
    setMenu(null);
  }
  // Same render-phase retire as resetKey: a menu opened before placing started must not reappear when it ends.
  if (options.suppressed && menu) setMenu(null);
  const onContextMenu: MouseEventHandler<HTMLCanvasElement> = event => {
    event.preventDefault();
    if (latest.current.suppressed) return;
    const cell = latest.current.cellAt(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const hint = cell === null ? "Not a map cell" : latest.current.disabledReason();
    setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, items: [{
      label: "Edit block", disabled: hint !== null, ...(hint !== null ? { hint } : {}),
      onSelect: () => {
        if (cell !== null && latest.current.disabledReason() === null) latest.current.onEditBlock(cell);
      },
    }] });
  };
  return { onContextMenu, element: <WorldContextMenu menu={menu} viewport={options.viewport} onClose={() => setMenu(null)} /> };
}
