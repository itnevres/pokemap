# D4 quality final review — 1c49c53

**PASS** for the remaining popup clipping finding. Read-only review of `git show`/`git diff`; no code edits or tests.

`ConflictAction` now measures the rendered popup in `useLayoutEffect` and clamps its left/top against the actual width and height with an 8 px inset. The popup CSS caps both dimensions to the viewport minus side insets, uses border-box sizing, and allows internal scrolling if necessary. This covers the former midpoint overflow as well as right and bottom edge positions. The new unit fixture asserts the rendered bounding rectangle at midpoint and far corner, while both canvas suites cover representative badge positions. No actionable issue remains in this narrow repair.
