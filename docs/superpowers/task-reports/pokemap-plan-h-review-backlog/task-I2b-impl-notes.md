# Task I2b implementation notes: gbaEditRoutes verbatim move

Branch `claude/plan-h-server-10-i2b`. Tier: high (shared routing order, error boundaries); verbatim-move discipline below.

## 1. Diff stat

`git diff -M --stat` (tracked files) plus the new file:

```
 packages/server/src/gbaRouteContext.ts |  41 ++
 packages/server/src/index.ts           | 694 +--------------------------------
 2 files changed, 60 insertions(+), 675 deletions(-)
 packages/server/src/gbaEditRoutes.ts   (new, ~705 lines)
```

## 2. Comment-line count (trimmed lines starting `//`, `/*`, `*`)

- index.ts at HEAD, block A (createEventMatch route) + block B (paint ... indicatorEditMatch): 69
- gbaEditRoutes.ts, the same range between `(() => {` and `fellThrough = true;`: 69
- Raw line count of the ranges: 639 before, 640 after (the one extra is the blank separator line between block A and block B).
- Whole gbaEditRoutes.ts has 89 comment lines: 69 moved, plus 20 outside the range: the moved `validateStampAndOrigin` doc comment (see section 6), the new `gbaEditRoutes` doc comment, and the `fellThrough` wrapper comment.
  Wrapper comments (new): the `/** Plan H I2b ... */` doc block above `gbaEditRoutes`, and the 5-line `// The moved text answers ... fellThrough ...` comment (adapted from gbaReadRoutes.ts; it additionally names the two `ctx.` edits).

## 3. Line-by-line check

Both ranges dumped, every line stripped of leading/trailing whitespace, blank lines dropped, `difflib.unified_diff`:

```
--- orig
+++ new
@@ -7 +7 @@
-if (disposed) return send(503, { error: "project closed" });
+if (ctx.disposed) return send(503, { error: "project closed" });
@@ -258 +258 @@
-project.forgetMap(name); allMapsCache = undefined;
+project.forgetMap(name); ctx.allMapsCache = undefined;
```

Indentation is unchanged (the IIFE body sits at the same 6-space depth as the `try {` body in index.ts), so the move is identical even before stripping. The two comments naming `editSessions.ts`'s `close()` are untouched.

## 4. Typecheck

`python -I C:/Users/Serve/.claude/locks/lockrun.py "npm run typecheck"`:
- Run 2 (before the unused-import prune, after the `allMapsCache` accessor fix): PASS, no errors (run 1 had found the `allMapsCache` write and the over-wide `extends GbaRouteContext`, both fixed).
- Run 3 (after the unused-import prune, the final tree, commit fae8afd): PASS, `exit=0`, no errors.

Typecheck does not enable `noUnusedLocals`, so unused imports were pruned with a script that drops any imported name not appearing in non-comment code: 37 names dropped from index.ts, `coverage` and `planSave` dropped from gbaEditRoutes.ts (they were only mentioned in comments).

## 5. ctx fields and `let` handling

`GbaEditRouteContext extends Pick<GbaRouteContext, "project" | "symbols" | "addEvents" | "editSessions" | "syncOverlay" | "overlayStamp" | "editEntryFor" | "pngCache">` (a Pick, not the whole `GbaRouteContext`, so no field is passed that no moved line reads: cachedRender, iconCache, getWorld, getEncounters, getCoverage, getSpecies are not read).

Extra fields: `signFailure`, `indicatorFailure`, `indicatorParagraphs`, `signPlan`, `sendSession`, `handleEventOp` (generic), `getAllMapsForWarpScan`, `EVENT_KINDS`.
`signPlan` is typed structurally because the moved text has `ReturnType<typeof signPlan>`; the index.ts assignment proves the structural type matches the real function.

`let`s reassigned after construction, handled by accessors on the ctx object:
- `disposed`: `get disposed()` only. Rewritten line (1): `if (disposed) return send(503, { error: "project closed" });` in the `createEventMatch` route's `readBody` callback -> `ctx.disposed`.
- `allMapsCache`: the moved commit route WRITES it (`project.forgetMap(name); allMapsCache = undefined;`). A getter alone would not work, so ctx has a read-write accessor (`get`/`set allMapsCache`) and that one line became `ctx.allMapsCache = undefined;`. `getAllMapsForWarpScan` (the lazy refill) stays in index.ts and reads the same variable, so the reset is seen.
- The other lazy caches the moved text might touch (`worldCache`, `encountersCache`, `coverageCache`, `speciesCache`) are not read by the moved text.

## 6. Deviations / things to know

1. `allMapsCache` setter (above): the brief anticipated only `disposed`; the typecheck found the write. Two lines of moved text changed in total (both listed in section 3).
2. `validateStampAndOrigin` (module-level, unexported, doc comment included) was used only by the moved paint routes, so it moved to gbaEditRoutes.ts with its doc comment instead of becoming a ctx field. index.ts no longer has it.
3. The `// Plan H I1:` comment above the read-route mount in index.ts still says "The option-lookup block that used to sit above `createEventMatch` now runs below it". It was outside the move range so it was left; `createEventMatch` now lives in gbaEditRoutes.ts, so that sentence is slightly stale (a later doc step can fix it).
4. Route order change: `createEventMatch` now runs after the read-route and sidecar mounts, as the brief specified. Disjointness verified by grep: the read routes match only `/api/project|groups|defects|map|render|metatile|species|encounters|warps|coverage|where|world` and `handleOptions` is GET-only; sidecar routes match `/api/world/*` and `/api/dungeons*`; blockEdits matches `/api/edit/<n>/block`, `/block/preview`, `/block/(check|apply)`. None matches `POST /api/edit/<name>/event/create`. The mount comment says so.
5. `gbaEditRoute` is built right after `let disposed = false;` (after `handleEventOp`, `signPlan`, `sendSession`, `addEvents`, etc. all exist), not next to `gbaReadRoute`, because `disposed` must already be declared for the accessor to read.
