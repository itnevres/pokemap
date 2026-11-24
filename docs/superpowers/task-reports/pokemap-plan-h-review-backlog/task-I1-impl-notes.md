# Task I1 implementation notes (GBA read routes moved to gbaReadRoutes.ts)

Tier: medium (verbatim move; any break is caught by the typecheck and the existing api tests, not run here per brief). Done inline: a mechanical scripted cut (python slicing by line range, asserted against the first/last lines of each block), not hand-retyped.

## 1. `git diff -M --stat`
```
 packages/server/src/gbaReadRoutes.ts   | 407 +++++++++++++++++++++++++++++++++
 packages/server/src/gbaRouteContext.ts |  30 +++
 packages/server/src/index.ts           | 389 ++-----------------------------
 3 files changed, 451 insertions(+), 375 deletions(-)
```
index.ts: 1485 -> 1124 lines. Of its 13 insertions: 1 import, 6 mount-construction lines, 5 mount comment/call lines, 1 changed encounters import.

## 2. Comment-line count (trimmed text starts with `//`, `/*` or `*`) of the moved range
- BEFORE: `git show HEAD:packages/server/src/index.ts`, lines 388-392 (block A) + 408-769 (block B): 146.
- AFTER: gbaReadRoutes.ts, between `(() => {` and `fellThrough = true;`: 146. Match.
- Wrapper comments added (outside the moved range): the 4-line file/function doc block (`/** ... */`) and the 3-line `fellThrough` explanation comment (the one the brief supplied).

## 3. Line-by-line identity
Moved range extracted from HEAD (`tr -d '\r'`, lines 388-392 + 408-769, 367 lines) and from gbaReadRoutes.ts (367 lines), both stripped of leading whitespace:
```
$ diff old_moved.txt new_moved.txt && echo IDENTICAL
IDENTICAL
```
Also diffed WITH indentation (no stripping): identical. No re-indent was needed: the IIFE body sits at the same 6-space depth the block had inside the `try {`.
(An early run showed three `§` characters differing: my script wrote the new files in cp1252; fixed to UTF-8, re-diffed clean.)

## 4. Typecheck
`python -I lockrun.py "npm run typecheck"` : EXIT 0 (tsc base + ui), run once before and once after the unused-import cleanup (result of the second run recorded below).
Second run (after import cleanup): EXIT 0, PASS.

## 5. GbaRouteContext fields (14, all read by the moved text)
project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, cachedRender, pngCache, iconCache, getWorld, getEncounters, getCoverage, getSpecies.
- `overlayState` is NOT a field: the moved text never reads it (only `overlayStamp`/`syncOverlay` do, inside index.ts).
- No stale-copy hazard: every field is a `const` in `createProjectHandler`. The lazily-filled caches (`let worldCache`, `encountersCache`, `coverageCache`, `speciesCache`) are reached only through their `const` getters (`getWorld` etc.), which close over the `let`; so no getter-in-ctx was needed. `pngCache`/`iconCache` are `const` Maps (mutated, never reassigned).
- Types: `Project`, `ReturnType<typeof createSymbolIndexCache | createGbaAddEventRoutes | createEditSessionStore | syncTilesetOverlay | buildWorld | coverage>`, `Encounters`, plain function/Map types. No `any`.

## Deviations / things to know
- Mount placement: `const gbaReadRoute = gbaReadRoutes({...})` is built right after the `blockEdits` mount, NOT next to `sidecarRoute` (index.ts ~line 138): `syncOverlay`, `overlayStamp`, `addEvents`, `editEntryFor` are `const`s defined at ~line 217-229, so building the ctx next to `sidecarRoute` would hit the temporal dead zone.
- `Send` is not exported anywhere; the brief's type is redeclared locally in gbaReadRoutes.ts (`type Send = (code: number, body: unknown) => unknown;`), same as `sidecarRoutes.ts` uses inline.
- Ordering: block A (GET option lookups) now runs after `createEventMatch` (POST /api/edit/<name>/event/create); disjoint paths, stated in the comment above the mount. The sidecar mount still follows the read routes, so `/api/world` keeps priority on its exact path.
- Unused imports removed from index.ts: `checkGbaMapDefects`, `renderMetatile`, `renderSpeciesIcon`, `parseBlocks`, `Placement`, `wireConflicts`, `parseBorder`, and `speciesChances`/`FISHING_RODS`/`Method`/`Rod`/`SpeciesChance` from the encounters import (kept `parseEncounters`, `Encounters`). tsc does not enable noUnusedLocals, so unused-ness was found by a script scanning each imported name against the remaining index.ts body. `decodeSegment`, `ProjectInfo`, `readSidecar`, `resolveWorldPlacements`, `whereSpecies` etc. are still used elsewhere in index.ts and stay (copies are imported in gbaReadRoutes.ts too).
- Files are CRLF in the working tree (core.autocrlf=true); the new files are CRLF too.
- Not run (per brief): vitest, UI build. No live check: server-internal refactor, no UI change.

## Review and gate (conductor, Medium tier)
- Combined Sonnet review (`task-I1-review.md`): PASS, 0 Critical / 0 Important / 2 Minor. Minor 1 fixed (unused `whereSpecies` import dropped from `index.ts`; the impl note above that said it was still used was wrong). Minor 2 (moved comments say "above" / "this file" about code now in another file) left on purpose: a verbatim move keeps comments; a later comment-only commit can reword them.
- Move re-checked by the conductor: old block B (`/api/project` .. `/api/world`) is a contiguous, whitespace-normalised subsequence of `gbaReadRoutes.ts` (335 non-blank lines); comment lines 145 in block B vs 154 in the new file (the extra 9 are block A's and the wrapper's); `index.ts` 1486 -> 1125 lines.
- Gate: vitest 5,563 pass / 2 fail / 293 files; typecheck pass; UI build pass. Fails: known `engine.test` env fail, and `WorldCanvasContext.test.tsx` "a plain double-click on a map body ..." (a load flake in a UI test this change cannot reach; the file plus `api.test.ts` pass alone, 90/90).
