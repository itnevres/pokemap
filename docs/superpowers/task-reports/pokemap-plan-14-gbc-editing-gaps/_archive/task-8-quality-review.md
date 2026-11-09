**CHANGES REQUESTED**

- **Important — `packages/ui/src/shared/AddEventDialog.tsx:87,95`: Initial focus can escape the modal.** Warp/coord/BG dialogs leave focus on the panel. `trapDialogFocus` wraps Shift+Tab only from the first control, so Shift+Tab from this initially focused panel moves into the underlying workspace. Handle the panel as a boundary or focus the first enabled control. Test actual keyboard traversal.

- **Important — `packages/ui/src/shared/AddEventDialog.tsx:115–120`: Searching hides the selected value without clearing it.** Select a sprite, then search for a different sprite. The original option disappears and the select displays “Choose…”, but `values.sprite` remains valid and Add submits that hidden original sprite. Preserve the selected option visibly or clear the value when filtering excludes it.

- **Important — `packages/ui/src/components/MapEditingWorkspace.tsx:125` and `packages/ui/src/gbc/GbcMapEditing.tsx:172`: The edit-request lock covers only painting.** Move, delete and duplicate bypass `trackEdit`. With any of those requests delayed, Add remains enabled without the required in-flight reason, allowing a dialog to open against pre-edit options. Track all relevant editing requests; add a deferred non-paint witness for both families.

- **Minor — `packages/ui/test/shared/AddEventDialog.test.tsx:111`: The double-click test does not witness the synchronous latch.** Each `fireEvent.click` flushes React updates; the second encounters an already-disabled button. This explains the surviving mutation. Dispatch two form submissions within one batching boundary against a deferred `createEvent`, and require latch removal to fail.

Builder field keys match the submitted mappings. No additional findings on visit guards, preview sequencing or return-warp notes. Test/build results are conductor-supplied; I did not rerun them or modify files.