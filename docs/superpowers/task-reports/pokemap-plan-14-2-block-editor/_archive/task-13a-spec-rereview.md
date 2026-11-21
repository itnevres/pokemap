Needs changes

- **Resolved — same-tick guards:** `packages/ui/test/shared/useBlockEditor.test.tsx:515,525` exercise duplicate `ok()` and `confirm()` calls within one `act`.
- **Not resolved fully — Minor, load lifecycle coverage:** Map/time changes and equivalent targets are covered at `packages/ui/test/shared/useBlockEditor.test.tsx:672,689,707`. Late **GET after unmount** remains untested; the unmount case at `:643` covers apply callbacks only.
- **Resolved — error paths:** `packages/ui/test/shared/useBlockEditor.test.tsx:714,723,730` assert GET fallback, network rejection, and plain apply rejection.
- **Resolved — preview coverage:** `packages/ui/test/shared/useBlockEditor.test.tsx:741,775,788` cover debounce restart, image preservation on `null`, and timer cancellation on unmount.
- **Resolved — field literals:** `packages/ui/test/shared/useBlockEditor.test.tsx:818,827` assert exact keys, labels, and option keys.
- **No new issues found.** D18 captures the request/revision once and reuses it for apply (`packages/ui/src/shared/blockEditor/useBlockEditor.ts:132,114,167`). Draft changes invalidate checking/confirming; cancellation does nothing outside those states (`:156,165`).

Read-only static review; Vitest green as reported by the conductor, not rerun.