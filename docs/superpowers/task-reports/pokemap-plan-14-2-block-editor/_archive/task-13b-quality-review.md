Needs changes

1. **Important — `packages/ui/src/shared/BlockEditorDialog.tsx:149` — Confirmation transitions lose keyboard focus.**  
   Entering confirmation removes the focused OK button; cancelling confirmation removes its focused Cancel button. The focus effect at line 55 only responds to loading/error changes, so neither transition repairs focus. A browser DOM probe confirmed that removing the focused footer leaves `document.activeElement` at `BODY`; subsequent keyboard events bypass the panel’s Tab trap.  
   **Fix:** Focus Apply when confirmation opens and restore focus to OK when it closes; also repair focus when Apply disappears during submission. Add tests using actual keyboard activation and deferred check/apply replies. Existing tests directly dispatch clicks and manually focus controls, masking this failure.

2. **Important — `packages/ui/src/shared/BlockEditorDialog.tsx:145` — Raw fallback controls disappear mid-entry.**  
   The choice between `RawField` and `SelectField` is recalculated after every keystroke. For an unknown GBA behavior of `7`, attempting to replace it with `20` first produces `2`. If `2` is a known behavior, React immediately replaces the focused input with a select, preventing the remaining digit from being typed normally. GBC names have the same problem when an intermediate string matches an option.  
   **Fix:** Keep raw editing active until blur or explicit completion, then switch control types while preserving focus. Test character-by-character entry through a recognized intermediate value; the existing test jumps directly from `7` to `9`.

3. **Minor — `packages/ui/src/styles.css:3256` — Undefined `--space-12` invalidates both grid minimum dimensions.**  
   `styles.css` defines spacing tokens only through `--space-6`. Consequently, both declarations are invalid at computed-value time. The browser probe measured 25px-high buttons instead of the intended 48px targets.  
   **Fix:** Express both dimensions using an existing token, such as `calc(var(--space-6) * 2)`. Add a check that every custom property referenced by the new styles exists.

4. **Minor — `packages/ui/test/shared/BlockEditorDialog.test.tsx:100` — Picker tests cannot detect broken image scaling.**  
   `picker()` supplies a fabricated 256px rectangle and dispatches events directly onto the image. No test loads an image or verifies its natural-size ×2 rendering. Removing the implementation’s `onLoad` sizing would therefore leave the placement tests passing while real browser clicks use the wrong scale. The panel-size test likewise checks class names rather than viewport fit.  
   **Fix:** Add browser coverage with a real image: verify rendered dimensions, select and deselect via coordinate clicks, hover reserved cells, and reach the footer and palette prompt at 720×560.

**Verification limits:** No files changed; Vitest was not run. Browser evidence used isolated DOM/CSS probes. The full React harness failed to bundle because sandbox directory access was denied, so end-to-end dialog behavior and full-content viewport fit remain unverified.