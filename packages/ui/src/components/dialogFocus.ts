import type { KeyboardEvent } from "react";

/** Keep keyboard navigation in the topmost dialog, including dialogs opened above an editor. */
export function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
    .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.hidden);
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
