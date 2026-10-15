# Task 8 implementer report

Implementer: Codex gpt-6-luna (scratch worktree codex-t8, edit+typecheck only); orchestrator ported diff, fixed one plan defect, gated, committed.

## Gate
npm test (repo root): 173 files passed, 2728 tests passed, 0 fail (= 2725 + 3). typecheck 0, build 0.

## Plan defect fixed (ruling)
Tool label `Collision` now shares its accessible name with MapCanvas's overlay toggle `Collision` (GBA Map view). Old lowercase `collision` was unique. 10 App.test.tsx tests failed with 'Found multiple elements with the role "button" and name "Collision"'. Fix: App.test.tsx lines 384-385, 447, 872-873 query inside `within(group "Tools")`; `within` imported. Spec mandates the label, so test scoping, not a label change.

## Hand-fixed loops (Codex)
Toolbar.test.tsx both loops -> labels; GbcAppEditing.test.tsx tool loop (line ~198) -> labels; ToolbarGbc.test.tsx button-list assertion compares textContent to labels (aria-label removed by brief Step 4).
CollisionPalette.test.tsx lowercase 'collision' queries are swatches, untouched.

## Removed-line accounting (test files)
- packages/ui/test/App.test.tsx: 24 removed — label rename (D5); import line + Collision queries: label rename (D5) + scope to Tools group (ruling)
- packages/ui/test/AppContextEdit.test.tsx: 1 removed — label rename (D5)
- packages/ui/test/AppContextStroke.test.tsx: 2 removed — label rename (D5)
- packages/ui/test/AppContextVisit.test.tsx: 2 removed — label rename (D5)
- packages/ui/test/AppEditingWiring.test.tsx: 1 removed — label rename (D5)
- packages/ui/test/Toolbar.test.tsx: 8 removed — label rename (D5)
- packages/ui/test/gbc/GbcAppContext.test.tsx: 4 removed — label rename (D5)
- packages/ui/test/gbc/GbcAppContextStroke.test.tsx: 1 removed — label rename (D5)
- packages/ui/test/gbc/GbcAppEditing.test.tsx: 5 removed — label rename (D5)
- packages/ui/test/gbc/GbcAppWorldGuard.test.tsx: 1 removed — label rename (D5)
- packages/ui/test/gbc/GbcMapEditing.test.tsx: 5 removed — label rename (D5)
- packages/ui/test/gbc/ToolbarGbc.test.tsx: 4 removed — label rename (D5); aria-label list -> textContent list (aria-label removed, D5)
