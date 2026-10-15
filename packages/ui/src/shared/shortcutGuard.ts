/** Typing never triggers a shortcut. */
export const isTextTarget = (t: EventTarget | null) =>
  t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;

/** The ignore rules every Plan 9 shortcut shares (spec "Toolbar (D5) and shortcuts (R1)"): already handled, typing, or a modal open. */
export const shortcutBlocked = (e: KeyboardEvent) =>
  e.defaultPrevented || isTextTarget(e.target) || document.querySelector('[aria-modal="true"]') !== null;
