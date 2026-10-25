# Task 9 re-review brief (Plan 12a)

Repo C:\Programming Projects\PokeMap, branch `plan-12-canvas-core`, uncommitted working-tree changes on top of HEAD. Read only; edit nothing but your output file; do not run vitest or builds.

Inputs: the final review `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-9-final-review.md` (1 Important, 4 Minor) and the coordinator's dispositions in `task-9-report.md` (same folder). Live evidence for I1: `task-8-shots/outside.mjs` and its results `gba-outside.json`, `gbc-outside.json`.

Check:
1. I1 ruling: does the measured live order (`pointerup mouseup lostpointercapture mouseleave`, both families; rect applied with a raw outside end; event moved once) refute I1? Is the probe sound (listeners on the right element, capture phase, a real release outside the canvas)? Does the new test in `packages/ui/test/canvas/MapSurface.test.tsx` ("a release outside in Chromium's event order…") pin that order and both outcomes?
2. M1: `git diff -- packages/ui/src` (comment only?); any dangling reference to deleted map-canvas internals left (`rg -n "MapCanvas\.tsx's own|GbcMapCanvas\.tsx's own|endActiveStroke" packages/ui/src`)?
3. M2-M4 dispositions acceptable?

Output: `docs/superpowers/task-reports/pokemap-plan-12-canvas-core/task-9-rereview.md`: verdict (Approved / Changes requested) and any findings (severity, file:line, fix). Return a one-line status plus that path.
