# Task 4 (4a+4b) review, Codex gpt-6-astra, range 6e0bb75..4e5c80f

Quality: Needs rework

- **Important - `packages/ui/src/shared/WarpPopup.tsx:16`**: Focus is set only on popup mount. SaveDialog, SwitchPromptDialog and SignEditor autofocus their controls but do not restore focus when dismissed. **Scenario:** close a dirty popup, then cancel the prompt. Its focused button unmounts, leaving focus on `body`; Escape no longer reaches the popup, and Tab can reach background navigation. Current tests manually focus controls or dispatch directly to dialogs, masking this. **Smallest fix:** restore focus to the originating popup control when secondary dialogs close, with the popup Close button as fallback. Test Cancel/Escape followed by keyboard events on `document.activeElement`, without manually refocusing.

- **Minor - `packages/ui/src/shared/WarpPopup.tsx:17`**: The original opener is captured too late when opening requires a dirty-map prompt. **Scenario:** focus the world canvas, request another destination, then choose Discard or Save. By popup mount, the prompt's focused control has been removed; the captured opener is typically `body`. Closing the popup therefore fails to restore canvas focus. **Smallest fix:** capture the opener when `open(dest)` is requested, preserve it through the prompt continuation, and pass it to WarpPopup. Add dirty-open Save/Discard focus-restoration cases.

Static review only; suites were not rerun.