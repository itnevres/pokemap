/** Typing never triggers a shortcut. */
export const isTextTarget = (t: EventTarget | null) =>
  t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null;

/** The ignore rules every Plan 9 shortcut shares (spec "Toolbar (D5) and shortcuts (R1)"): already handled, typing, or a modal open.
 *  Plan 13: the warp popup (`data-warp-popup`) is the one modal that keeps shortcuts, and only for callers whose `owner`
 *  element sits inside it, so the World host workspace behind the popup stays inert. */
export const shortcutBlocked = (e: KeyboardEvent, owner?: Element | null) => {
  if (e.defaultPrevented || isTextTarget(e.target)) return true;
  if (document.querySelector('[aria-modal="true"]:not([data-warp-popup])')) return true;
  const popup = document.querySelector("[data-warp-popup]");
  return popup !== null && !(owner && popup.contains(owner));
};
