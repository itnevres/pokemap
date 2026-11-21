Needs changes

- **Important — `packages/ui/test/shared/useBlockEditor.test.tsx:391`:** Double-submit coverage retries only after React renders. A state-only guard would pass while allowing `ok(); ok();` in one event to send two checks. Add same-tick assertions, including repeated `confirm()`.

- **Minor — `packages/ui/test/shared/useBlockEditor.test.tsx:183`:** Load lifecycle coverage checks only target changes. Regressions that accept late replies after map/time changes or unmount, or reload on equivalent target-object replacement, are not pinned.

- **Minor — `packages/ui/test/shared/useBlockEditor.test.tsx:176`:** Missing error-path assertions: GET fallback text, network rejection, and ordinary non-`EditSessionError` apply rejection. These could lose the required message without failing this suite.

- **Minor — `packages/ui/test/shared/useBlockEditor.test.tsx:199`:** Preview coverage never changes the draft during a pending debounce or returns `null` after an existing image. Failure to reset the timer, cancel it on unmount, or preserve the image on `null` would escape detection.

- **Minor — `packages/ui/test/shared/useBlockEditor.test.tsx:505`:** Neither spec test checks field keys or labels. Incorrect collision quadrant keys/labels or GBA field keys would pass.

The implementation otherwise matches the brief on static inspection. `{ request: R }` plus the session-added top-level `revision` matches the server. No JSX/CSS/dialog changes or implementation edits to tests. Tests were not executed.