import { useState } from "react";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import { ProjectPicker } from "./ProjectPicker.js";
import "../styles.css";

export interface ProjectSwitcherProps {
  current: ProjectInfo;
  onOpened: (info: ProjectInfo) => void;
}

/** The last path segment of `root`, backslash-tolerant (win32) -- purely a
 *  display label, same "client-side guess, never the canonical thing"
 *  posture as `ProjectPicker`'s own `guessParent`. */
function folderName(root: string): string {
  const norm = root.replace(/\\/g, "/");
  const trimmed = norm.length > 1 && norm.endsWith("/") ? norm.slice(0, -1) : norm;
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * The header button (`App.tsx`/`GbcApp.tsx`'s own `switcher` prop) that
 * opens `ProjectPicker` in a modal to switch the currently-open project.
 * Reuses `WarpDestinationModal`'s own backdrop/panel shell
 * (`.warp-modal__backdrop`/`.warp-modal__panel`) rather than inventing a
 * second modal chrome -- same pattern `SaveDialog.tsx`/`SwitchConfirmDialog`
 * use. `ProjectPicker`'s own Close button (rendered because `onClose` is
 * passed) is the modal's first focusable and carries its own `autoFocus`,
 * which is what lets Escape reach this backdrop's `onKeyDown` at all (same
 * reasoning as `SaveDialog`'s own Cancel `autoFocus`).
 */
export function ProjectSwitcher({ current, onOpened }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const name = folderName(current.root);

  return (
    <>
      <button
        type="button"
        className="map-canvas__btn hub-switcher__btn"
        title={current.root}
        aria-label={`Switch project (current: ${name})`}
        onClick={() => setOpen(true)}
      >
        {name}
      </button>
      {open && (
        <div
          className="warp-modal__backdrop"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="warp-modal__panel hub-picker--modal" role="dialog" aria-modal="true" aria-label="Switch project">
            <ProjectPicker onOpened={onOpened} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
