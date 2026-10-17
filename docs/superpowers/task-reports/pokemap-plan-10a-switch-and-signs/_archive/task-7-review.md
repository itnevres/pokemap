Status: Not approved (C=0 I=4 M=2)

## Critical

None.

## Important

- `packages/ui/src/components/MapCanvas.tsx:706` and `packages/ui/src/gbc/GbcMapCanvas.tsx:630`: both canvas callbacks pass the whole canvas rectangle, not the clicked tile’s rectangle. The editor styles itself from that rectangle (`SignEditor.tsx:57`), so clicking any tile anchors the popover at the canvas edge rather than the selected tile.

- `packages/ui/src/shared/SignEditor.tsx:60`: the Sign editor lacks required `aria-modal="true"`. With the editor open, toolbar shortcuts remain active; pressing `P` or `G` while focus is not in a text control changes the selected tool behind the dialog, violating S2.

- `packages/ui/src/shared/SignEditor.tsx:68`: previewing uses `line.slice(0, 18)`, which discards every character after column 18 and creates neither wrapped continuation lines nor pages. A 19-character free-text sign therefore displays an incomplete preview before Place/Update.

- `packages/ui/src/components/MapEditingWorkspace.tsx:164` and `packages/ui/src/gbc/GbcMapEditing.tsx:206`: no client map-event data is passed to `SignEditor`, and `SignEditor.tsx:63-70` renders no object-event note. Selecting a tile occupied by an object event omits the S9a-required warning.

## Minor

- `packages/ui/test/shared/SignEditor.test.tsx:8-31`: coverage verifies only free-text Place/refusal plus two display branches. It does not exercise editable Update, either hand-edited force path, Escape, linked modes, or object-event notes, so the required S1 branches are not discriminatingly pinned.

- `packages/ui/test/gbc/ToolbarGbc.test.tsx:12-20`: the GBC test hard-codes the old five-tool list and asserts that no Sign button exists. It passes without testing the actual `GbcMapEditing` wiring, allowing a GBC Sign regression to evade the suite.

Fix-round check: when no tile has been picked, `signPick` starts as `null` and both hosts conditionally mount `SignEditor` only when it is non-null (`MapEditingWorkspace.tsx:59,164`; `GbcMapEditing.tsx:66,206`); no stray dialog/fetch was found.