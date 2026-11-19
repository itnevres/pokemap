Needs changes

- **Not resolved completely — Important, lifecycle coverage:** `packages/ui/test/shared/useBlockEditor.test.tsx:810`, `:844`, `:863`, and `:886` cover pending checks after unmount, map changes, and time changes, plus apply after map changes. However, `:841` checks frozen `result.current` after unmount; it would pass even if the preview guard were removed because React ignores state updates after unmount. Add an assertion that detects the forbidden state-update attempt.
- **New — same ineffective assertion in GET coverage:** `packages/ui/test/shared/useBlockEditor.test.tsx:806` cannot detect removal of GET cancellation; the preview effect also cannot run after unmount.

Static review; 103/103 passing per conductor, not rerun.