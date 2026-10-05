# D3 integrated spec fix review — 410acfb

Status: **PASS for SR1–SR3 and the inspected fix diff**. Reviewed `git show 410acfb` and committed surrounding test/fit code only. No tests, source mutations, external file writes, or working-tree code inspection ran. The implementer's execution results remain reported evidence; this verdict is independent source/test inspection.

## Findings resolved

**SR1, stale selection outside a new scope: resolved.** `GbcWorldCanvas` now clears excluded selection plus stale hover/tooltip when `mapFilter` changes. Enter separately validates current scope before calling `onOpenMap`, so the boundary remains protected even before the effect has cleared stale state. The new test first proves Source was selected and hovered, switches to Hidden-only scope, presses Enter, and asserts no open callback, no selection outline, and cleared hover. It tests the actual formerly reachable path rather than merely asserting filter internals.

**SR2, marker double-click changing underlying selection: resolved.** `onClick` now computes marker hit distance using the same screen positions and radius as the double-click path, returning before body selection when a drawn marker is hit. With markers off or below LOD, no marker entries participate and ordinary body behavior remains. The new realistic click/click/double-click fixture selects one map, targets the other map's marker, and asserts only the original selection callback, no body-open callback, and the expected destination dialog. Following Escape, left/top/width of the original selection outline remain identical. Those three geometry values independently constrain selection, pan, and zoom in this fixture.

**SR3, rendered endpoint guarantees: resolved.** The new test asserts actual DOM marker coordinates and all four SVG endpoint attributes, not only the projection helper. Independently deriving its setup: bounds are x=10..35 and y=20..45, so a 200×200 viewport gives zoom=8 and initial pan=(-80,-160). The simulated drag adds (83,167), giving pan=(3,7). Raw event (10,9) becomes (5,4.5) blocks. Source therefore renders at ((10+5)×8+3,(20+4.5)×8+7)=(123,203); destination at ((30+5)×8+3,(40+4.5)×8+7)=(283,363). Both the third source marker and the line are pinned to those literal values. The report also records separate red proofs for marker consumer wiring and destination placement wiring.

## Fix-specific regression inspection

The GbcApp filter cache keys the dungeon ID plus sorted member contents, retaining Set identity on rename and member reordering. Different dungeon IDs or changed member contents create a fresh filter, preserving required scope-change fitting. The added application test verifies guarded PATCH/reload preserves a manually panned selection on rename, then membership addition refits it. This closes the unrelated-refit problem without changing the shared GBA canvas or hook. The new warp error group adopts the existing shrinkable error modifier; the modified malformed-payload test checks that modifier with a long visible error. No GBA production code or tests change in this fix.

The only pre-existing test modified in this fix is the D3-added `shows malformed warp payload errors and permits retry after a later toggle`, extended to prove the long-error layout class. Other changes add tests or parameterize the D3 fixture helper. No assertion was weakened or removed.

No new blocker found in this fix scope. Final coordinator mutation execution, complete per-new-test red-proof accounting, broader verification, and external-state comparison remain coordinator gates; this narrowly requested re-review does not substitute for them.
