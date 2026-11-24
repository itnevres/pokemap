# Task I1 combined review (commit c81902c)

Verdict: PASS. 0 Critical, 0 Important, 2 Minor.

## Spec checklist (plan-h-hardening.md Task I, I1; traps 22, 26)

| Criterion | Status | Evidence |
|---|---|---|
| Move the read-only GBA routes to `gbaReadRoutes.ts` | met | `gbaReadRoutes.ts:36-402`. Trap 22's extra routes (project, groups, warps, coverage, species, where) moved too: `:41`, `:45`, `:298`, `:321`, `:335`, `:346`. |
| Event/indicator option lookups moved | met | block A at `gbaReadRoutes.ts:36-40` |
| `GbaRouteContext` defined in the I1 commit, listing closure values, no invented fields, no unread fields | met | `gbaRouteContext.ts:21-36`; all 14 fields are read by the moved text (project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, cachedRender, pngCache, iconCache, getWorld, getEncounters, getCoverage, getSpecies). |
| No test edited, test count unchanged | met | `git diff --stat` for the commit lists only `gbaReadRoutes.ts`, `gbaRouteContext.ts`, `index.ts` and the impl-notes file. |
| `git diff -M` shows moves; trap 26 comment check | met | See check 1. |
| `index.ts` holds context construction and mount | met | `index.ts:307-312` (construction), `:403-407` (mount). |

## Checks requested

1. **Verbatim move.** Met. I extracted the original block A (`c81902c~1` index.ts lines 388-392) and block B (408 through the closing `}` of `/api/world`) and diffed them against `gbaReadRoutes.ts:36-402` with leading whitespace stripped. The only differences were the lines that followed `/api/world` in my over-long extraction, which belong to the sidecar-mount comment and stayed in index.ts. All 146 comment lines are present. The indentation is unchanged too, as the IIFE body sits at the same depth the block had inside `try {`.
2. **Order and mount.** Met. Block B is contiguous in the new file, in the original order. The single mount (`index.ts:407`) sits right after `createEventMatch`, where block B started, and still precedes the sidecar mount (`:414`), so `/api/world` keeps its priority over `/api/world/conflicts/accept`. The `createEventMatch` route now runs before block A. It only matches POST `/api/edit/<name>/event/create`. Block A only acts when `req.method === "GET"`. The two are disjoint by method as well as by path, so no request changes outcome. One side effect moves with the order: a POST no longer runs through block A. Block A did nothing on a POST (the `syncOverlay()` call is inside the GET guard), so this is unobservable.
3. **`fellThrough` IIFE.** Met.
   - Every `return` in the moved text (bare `return;` at `:39` and every `return send/res.end`) leaves the IIFE before `fellThrough = true` at `:403`, so the wrapper returns true.
   - A request that matches no route reaches `:403` and returns false.
   - The moved text has no async routes (`readBody` appears only in `createEventMatch`, which stays in index.ts). The only async route in this region is therefore not moved.
   - An exception thrown inside the IIFE propagates out of the arrow function to the `try`/`catch` in `handle`; nothing swallows it.
   - The IIFE return type infers as `unknown`, so there is no `noImplicitReturns` issue (the tsconfig does not set it anyway).
4. **Context freshness.** Met. All 14 fields are `const` in `createProjectHandler` (`index.ts:109,110,117,126,144,165,170,182,189,211,216,217,221,223`). The lazy caches are reached only through their `const` getters. No later reassignment of `project`, `symbols`, `pngCache`, `iconCache`, `editSessions` or `addEvents`. The ctx is built at `:307`, after every referenced `const`, so there is no TDZ problem.
5. **`res` passthrough.** Met. The route function takes `(req, res, url, send)` and the PNG routes call `res.writeHead`/`res.end` directly (`gbaReadRoutes.ts:151-152,157-158,193-194,242-243`).
6. **Imports and wrappers.** Partly met, see Minor 1. `gbaReadRoutes.ts` imports everything it uses and nothing extra. No pass-through wrappers were added. The IIFE is needed to avoid editing moved lines and is not a pass-through.

## Findings

### Minor 1: leftover unused import in index.ts
`packages/server/src/index.ts:24` still imports `whereSpecies`, but the only other mention in the file is a comment at `:177`. The `/api/where` route that used it moved. The impl notes (line 42) wrongly say it is still used. tsc does not enable `noUnusedLocals`, so nothing fails, but it is a dead import. Fix: change line 24 to `import { coverage, allSpecies } from ...`. Every other import I checked (`encodePng`, `renderLayout`, `readSidecar`, `resolveWorldPlacements`, `refuseBrokenLayout`, `ProjectInfo`, `Encounters`, `parseEncounters`, `readFileSync`, `decodeSegment`, `refusalBody`) has a remaining use in index.ts.

### Minor 2: moved comments now say "above"/"this file" about code in another file
Verbatim moves keep these, as the spec wants, so this is not a defect, but a reader of `gbaReadRoutes.ts` will be misled. Examples are "all driven off one coverage() call (cached above)" at `:313`, "this file's generic 404" at `:170` and "this file's own established convention" at `:165`. The caches live in index.ts. Optionally fix in a later comment-only commit.

### Note (no action)
`type Send` is redeclared locally (`gbaReadRoutes.ts:21`) with an `unknown` return, a fourth local copy next to the `void` copies in `addEventRoutes.ts`, `blockEditRoutes.ts` and `gbcEditRoutes.ts`. It matches the file-local idiom and assigns fine to `handleOptions`'s `void`-returning parameter. Hoisting a shared `Send` is a candidate for I2 and is out of scope here.

## Not verified
I ran no tests or typecheck, as instructed. I rely on the gate for those.
