import { useLayoutEffect, useState, type KeyboardEvent } from "react";

interface FocusReturn { opener: Element | null; previous: FocusReturn | null }
const focusReturns: FocusReturn[] = [];

/** Capture before child autofocus. Keep the return chain across dialogs replaced in the same commit. */
export function useRestoreFocus() {
  const [entry] = useState<FocusReturn>(() => ({
    opener: document.activeElement,
    previous: focusReturns.at(-1) ?? null,
  }));
  useLayoutEffect(() => {
    focusReturns.push(entry);
    return () => {
      const index = focusReturns.indexOf(entry);
      if (index !== -1) focusReturns.splice(index, 1);
      // Real deletion removes the focused node after layout cleanup; replay and newer dialogs keep their focus.
      queueMicrotask(() => {
        if (document.activeElement !== null && document.activeElement !== document.body) return;
        let target: FocusReturn | null = entry;
        // A prompt control may have been removed before its replacement dialog mounted.
        while (target && !(target.opener instanceof HTMLElement && target.opener.isConnected)) target = target.previous;
        if (target?.opener instanceof HTMLElement) target.opener.focus();
      });
    };
  }, [entry]);
}

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
