**PASS.** No remaining findings.

- Pending fits re-resolve current placement and scope; StrictMode replay, valid re-jumps, and reloads preserve correct ordering. GBA’s jump path remains available for Task 8’s specified changes.
- Shift-click matches old GBC; the default preserves GBA’s modifier guard.
- Evidence count correctly totals 13 cases.
- Independently derived: fit `10/32 → 31%`; jump `24/32 → 75%`; wheel `12/32 → 38%`. Shift-click points map to `(5,5)` inside MapA and `(5,14)` outside.
- Without F handling, the revised test stays at 38% and fails its 31% assertion.
- No family branch in `canvas/`; only the three permitted existing tests changed.

Read-only inspection; no tests or builds run.