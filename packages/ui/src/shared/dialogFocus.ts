import type { KeyboardEvent } from "react";

/** Keep Tab in the topmost dialog. Acts only when the target's nearest `aria-modal` panel is this one, so an outer
 *  dialog (the warp popup) defers to a dialog nested inside it (Plan 13). */
export function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const panel = event.currentTarget;
  if (!(event.target instanceof Element) || event.target.closest('[aria-modal="true"]') !== panel) return;
  const controls = [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
    .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.hidden);
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
