# Plan 13 final whole-branch review

Codex gpt-6-astra, read-only, range 0da6e5b..4d3e226 (user chose Astra 2026-11-02). Session 01a19e4b-3b79-78c0-8657-fe716957b1ab.

Final: Approved with fixes

- **Minor — [dialogFocus.ts:35](<C:/Programming Projects/PokeMap/packages/ui/src/shared/dialogFocus.ts:35>):** The focus trap has no fallback when all controls become disabled. During a slow popup-close Discard, `SwitchPromptDialog` disables every button; Tab can escape into the underlying popup or application, violating topmost-dialog focus ownership. Smallest fix: make the prompt panel programmatically focusable, focus it when busy, and consume Tab when no enabled controls remain. Add a delayed-discard regression covering Tab and Shift+Tab.
## Conductor

Verified against code: busy SwitchPromptDialog disables all three buttons; trapDialogFocus filtered to zero controls and did nothing, and focus on a disabled button falls to body outside the panel. Fixed inline (reason: ~8 lines, 2 files, exact fix named): panel tabIndex=-1 and focused when busy; trap consumes Tab when no enabled control remains. Regression test in test/shared/SwitchPromptDialog.test.tsx red first (activeElement stayed on the button), green after; mutation (drop the empty-controls guard) kills it. No re-review: Minor, red/green + mutation shown.
