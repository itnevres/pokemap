# Task 5 fix round 1 (finish Codex's partial implementation)

Work ONLY in this worktree: `C:/Users/Serve/AppData/Local/Temp/claude/C--Programming-Projects-PokeMap/0f8b92cb-134d-4121-a4f0-c5dbe75162fb/scratchpad/wt-t5` (its `node_modules` are junctions; vitest runs here). Do not commit. Do not touch the main checkout.

Read, in order: `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-5-brief.md` (the binding brief), Codex's `task-5-impl-notes.md`, and Codex's own self-reviews `task-5-spec-review.md` and `task-5-quality-review.md` in the same folder (unofficial; verify each finding against the code before acting on it). Then the files: `packages/ui/src/canvas/WorldSurface.tsx`, `worldSurfaceAdapter.ts`, the `useStage.ts` diff (`git diff`), `packages/ui/test/canvas/WorldSurface.test.tsx`. Source canvases for comments and behaviour: `packages/ui/src/gbc/GbcWorldCanvas.tsx`, `packages/ui/src/components/WorldCanvas.tsx` (read only the sections the brief cites).

Codex ran out of quota. Its code passes its 5 tests and typecheck but is incomplete. Fix:

1. **Style.** Reformat `WorldSurface.tsx` and `worldSurfaceAdapter.ts` to the surrounding code's style (`GbcWorldCanvas.tsx`, `canvas/useWorldDrag.ts`): one statement per line, no multi-statement one-liners, JSX elements on their own lines, lines ≲ 140 chars. Every adapter field gets a one-line doc comment (the brief's type has them).
2. **Rationale comments.** Moved logic keeps its reasons, shortened: the `fitted` gate (GBC header "Fix round (spec review F5)" + the initial-fit comment: the ~308 of 391 renders measured live), the single view value and StrictMode, `fittedFilterRef` (GBA `WorldCanvas.tsx:761-817`, shortened), the jump token guard and the separately-scoped fade effect (both canvases' comments), the highlight `key` by token, the encounter cache (once per map ever, not keyed on cacheKey; failure counted and marked loaded so it never retries), border side over every drawn placement with the `ponytail:` O(n²) comment, the `viewport` draw dependency (Task 21 canvas blanking), and `chromeless: true` (the surface binds F itself; no ContextMapFit provider wraps a world canvas). No comment block parked above a short wrapper.
3. **Bug: failed encounter fetch.** Both canvases mark a failed map loaded with no summaries, and the border then receives `[]` (loaded, empty), not `undefined` (still loading) — `GbcWorldCanvas.tsx:702-713`, `:761`. Codex leaves the entry `null`, so a failed map reads as loading. Store a loaded-empty entry on failure; add a test.
4. **Missing tests** (the brief's list has 9; Codex merged some and skipped others). Make sure each of these exists, as its own `it`, with hand-derived numbers in comments (a production call may cross-check, never supply):
   - draw order: one ordered call log: tile `drawImage` calls, then the `drawExtraLayers` call, then the first badge path (`drawDiamond` uses `beginPath`/`moveTo`/`fill`); a mutation that draws badges before tiles must fail it;
   - jump fit at 60%: exact zoom and pan;
   - jump highlight keyed by token: a re-jump to the same map with a new token renders a NEW DOM node (node identity differs);
   - culling: an off-screen placement after the fit never creates an Image with its URL;
   - projection after pan AND wheel zoom: the jump outline's left/top/width/height equal the `drawImage` rect for that map (drive a real `wheel` event on the canvas; for the pan, drive a second jump or `fit`, whichever the surface exposes in Task 5);
   - status items receive `zoomPercent`, `hiddenCount`, `unplacedCount` with hand-derived values;
   - the failed-encounter case from item 3;
   - any brief case Codex's tests do not cover (check each of 1-9 explicitly and list the mapping in your report).
   Do not weaken an existing assertion.
5. **Codex self-review findings:** fix each one you confirm against the code; list rejected ones with the reason.
6. **Do not** add Task 6 behaviour. Keep the `fitFirst`/`legendExtras`/`toolbarExtras` slots unless a confirmed finding says otherwise. No `gba|gbc|family` words in the new canvas files. No `key={url}` remounts.

Line endings: the repo uses CRLF in the working tree (autocrlf). Leave files as whatever your editor writes; the conductor normalises.

**Verify** (run it yourself, from the worktree root, foreground, with a timeout):
`timeout 300 npx vitest run packages/ui/test/canvas/WorldSurface.test.tsx packages/ui/test/canvas/useStage.test.tsx` → all pass, count ≥ the current 29 plus your new cases; `timeout 300 npm run typecheck` → clean. Then kill leftover vitest/tinypool node processes only if any remain from YOUR run. Never run the full suite.

**Mutations** (do them yourself, restoring the file after each, record pass/fail): (a) draw before the fit lands (remove the `view.fitted` gate in `visible`); (b) `fitClusters` → fit every placement; (c) jump fraction 1.0; (d) the jump outline computes its own rect without `view.pan`; (e) badges drawn before tiles; (f) the error placeholder shows "Loading world…". Each must fail at least one test. Restore every file (`git diff` clean of mutation residue).

**Report** to `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-5-fix1-report.md`: what changed, brief-case → test mapping, mutation table, self-review findings accepted/rejected, final test count and typecheck result. Your final message: ONE line, status + that path.
