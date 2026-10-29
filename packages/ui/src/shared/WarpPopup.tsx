import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { trapDialogFocus, useRestoreFocus } from "./dialogFocus.js";
import { isTextTarget } from "./shortcutGuard.js";
import "../styles.css";

export interface WarpPopupProps {
  mapName: string;
  onClose(): void;
  children: ReactNode;
}

/** Plan 13 (P13-1): the shell's modal around the destination map's full workspace. Same chrome as
 *  WarpDestinationModal; a backdrop click never closes (edits must go through the close guard). */
export function WarpPopup({ mapName, onClose, children }: WarpPopupProps) {
  useRestoreFocus();
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    trapDialogFocus(e);
    // Escape belongs to a dialog above or inside the popup, or to a text field, before it closes the popup.
    if (e.key !== "Escape" || e.defaultPrevented || isTextTarget(e.target)) return;
    if (document.querySelector('[aria-modal="true"]:not([data-warp-popup])')) return;
    onClose();
  };

  return (
    <div className="warp-modal__backdrop">
      <div className="warp-modal__panel" role="dialog" aria-modal="true" data-warp-popup=""
        aria-label={`${mapName} (warp destination)`} onKeyDown={onKeyDown}>
        <div className="warp-modal__header">
          <span className="warp-modal__title">{mapName}</span>
          <button ref={closeRef} type="button" className="warp-modal__close" onClick={onClose} aria-label="Close">
            {"\u00d7"}
          </button>
        </div>
        <div className="warp-modal__body">{children}</div>
      </div>
    </div>
  );
}
