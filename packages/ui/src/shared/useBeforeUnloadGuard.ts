import { useEffect } from "react";

/** No autosave means a dirty session must never be lost silently at the browser boundary.
 * Attach only while dirty: a session matching disk is safe to abandon, and an always-on handler would falsely prompt. */
export function useBeforeUnloadGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
