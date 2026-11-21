Needs changes

1. **Important — Resolved: confirmation focus loss.**  
   `packages/ui/src/shared/BlockEditorDialog.tsx:65–72` focuses Apply on confirmation, restores OK on cancellation, and focuses the panel when the focused element disappears. It respects pending palette prompts and topmost-modal ownership. Tests at `packages/ui/test/shared/BlockEditorDialog.test.tsx:512`, `:701`, and `:712` cover these transitions. Actual keyboard activation remains untested; the tests still dispatch clicks.

2. **Important — Resolved: fallback controls disappear mid-entry.**  
   `packages/ui/src/shared/BlockEditorDialog.tsx:159–164` chooses the control from `info.block`, matching D25. Draft changes no longer switch control types. The regression test at `packages/ui/test/shared/BlockEditorDialog.test.tsx:670` exercises `7 → 2 → 20` and checks the submitted value.

3. **Minor — Resolved: undefined spacing token.**  
   `packages/ui/src/styles.css:3256` now uses `calc(var(--space-6) * 2)` for both minimum dimensions. A read-only reference scan confirmed that every custom property referenced by the `.block-editor*` styles is defined.

4. **Minor — Not resolved: real-browser picker and viewport coverage.**  
   `packages/ui/test/shared/BlockEditorDialog.test.tsx:600–608` now detects removal of the image’s load-sizing handler, which is useful progress. However, it fabricates natural dimensions and dispatches a load event; coordinate tests still mock geometry. The panel test at `:150–155` still checks classes only. Real-image rendering, coordinate selection/deselection, reserved-cell hover, and footer/palette-prompt access at **720×560** remain unverified.

**New issues:** None identified in the fix.

Read-only review of `0c3243f..0567a41`; no files changed. Vitest was not run, as instructed. No browser, typecheck, or build verification was performed in this review.