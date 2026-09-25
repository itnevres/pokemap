# Task 7 Code-Quality Review — GBC Map Event Loader

Scope: `git diff 244fc40 1929e4d -- packages` (events.ts new, asm.ts +42, asmSplice.ts refactor, types.ts +95, events.test.ts new ~611 lines).
Spec compliance: already approved (391-map field-by-field match). This review: code quality only.

## Verification run
- `npm run typecheck`: clean, no output, exit 0.
- `npm test` (full suite): **285/285 passed**, 9 files, 6.02s total.
- `events.test.ts` alone: 44/44 passed, 621ms test time (9 corpus-scale cases over 391 maps each — negligible; no perf concern).

## asm.ts / asmSplice.ts refactor
- Clean extraction. `labelTail(text, label)` in `asm.ts` (lines 262-280) is the exact prior body of `locateEventCall`'s section-bounding logic, unchanged in behavior; `LABEL_LINE_RE` now has one copy (removed from `asmSplice.ts`), `escapeRegExp` import dropped from `asmSplice.ts` with no dangling reference. `locateEventCall` (asmSplice.ts:76-90) is now a thin 15-line wrapper — clear contract, good name (`LabelTail{text,offset,lineIndex}` mirrors what callers need: bounded text + absolute line/byte anchoring).
- **Minor** — refusal message changed: old `locateEventCall` threw `` `locateEventCall: no "${label}:" label found` ``; new `labelTail` throws `` `labelTail: no "${label}:" label found` `` (asm.ts:267). Caller identity in the message shifted from the public API a Plan-7 consumer actually calls (`locateEventCall`) to the internal shared primitive. Not a functional break — the map name is still present, and the existing `asmSplice.test.ts:209` regex (`/NewBarkTown_MapEvents/`) still passes — but a bare `console.error(e.message)` at a call site now reports "labelTail" instead of "locateEventCall", which is a half-step less useful for debugging a Plan-7 splice failure. Low priority; consider having `locateEventCall` catch-and-rewrap, or accept as-is since the stack trace still shows `locateEventCall`.

## events.ts structure
- Per-kind mapping (`toWarp`/`toCoord`/`toBg`/`toObject`/`toSceneScript`/`toCallback`, lines 40-92) is readable: named destructuring for every field, no positional-index access leaking into call sites. The 13-arg `toObject` (58-77) is the standout case the review flagged as highest-risk, and it reads cleanly — each of the 13 destructured names lines up 1:1 with the interface field of the same name, in the same order, so a transposition would show up immediately on diff.
- `requireArgCount` (32-38) is a good small shared primitive — 5 of 6 `to*` functions route through it; `toSceneScript` (79-86) correctly opts out (1-or-2-arg macro) rather than being forced through it.
- Duplication across `toWarp`/`toCoord`/`toBg`: each is `x,y + two more fields`, near-identical shape but different field names per interface — **not worth extracting**; a generic `(x,y,field3,field4)` helper would save ~2 lines per function at the cost of losing the direct name-to-name readability that makes the object_event case trustworthy. Leave as-is.
- `checkSectionOrder` (98-112) and `parseObjectConsts` (120-134) are both single-purpose, appropriately sized.

## Type design (types.ts)
- Field naming is consistent and self-documenting: `x`/`y` uniform across all 4 event kinds; `script` uniform across coord/bg/object/sceneScript/callback; numeric vs raw-string choices are each justified inline in the doc comment (e.g. `hour1`/`hour2`/`palette`/`eventFlag` kept raw with the corpus counts that justify it — GBC format findings-style rigor carried into the type docs, good).
- No missing field for Plan 7: deliberately no per-event arg-span data on these records (only `lineIndex`). This is correct, not an omission — Plan 7's splicer re-locates via `locateEventCall(text, mapName, macro, ordinal)` against a possibly-already-edited text rather than trusting stale spans captured at load time (consistent with `spliceArg`'s own stale-call guard in `asmSplice.ts:36-41`). Recommend no change; adding arg spans here would be speculative and would invite exactly the staleness bug `spliceArg` guards against.
- `GbcMapEvents` doc comment (230-239) correctly calls out that array order == splice ordinal and must never be resorted — this is the one invariant a future editor of `events.ts` could accidentally break (e.g. by sorting objects by x/y for display) with no type-level enforcement, but that's inherent to the format and appropriately documented rather than over-engineered against.

## Errors
- All per-macro refusals name map + line + macro via `fail()` / `requireArgCount()` (e.g. events.ts:35 `` `"${macro}" has ${call.args.length} argument(s), expected ${expected}` `` combined with `${mapName}:${lineIndex+1}:` prefix). Consistent with the task's ask.
- **Minor** — `fail`'s doc comment (line 26) claims it "matches `tileset.ts`'s `parsePaletteMap` refusal style," but the styles differ: `parsePaletteMap`'s `fail` prefixes every message with its own function name (`` `parsePaletteMap: ${source}:${line+1}: ${msg}` ``, tileset.ts:119), while `events.ts`'s `fail` omits any function-name prefix (`` `${loc}: ${message}` ``, events.ts:29). Not a bug — messages are still map+line+macro as required — but the comment overstates the parity. Fix: either drop the "matches ... style" claim, or add a `parseMapEvents:` prefix for true consistency. Cosmetic.
- `checkSectionOrder`'s missing/out-of-order refusals (events.ts:104,107) pass `lineIndex: null`, so they name the map but not a line number, unlike every other refusal in this file. Reasonable given the error is about a section-marker's position/absence rather than one line, and a marker's own offset (`m.index`) *could* be converted to a line number the same way `labelTail` does — but this is a nice-to-have, not a defect; the map name plus the marker name in the message is enough to locate the problem by search.

## DataDefect usage
- Matches Task 3's/`map.ts`'s established shape exactly: `{ file, message }` with `message` self-prefixed by `file` (compare `loadLayout` in `map.ts:314-321` to `loadGbcMapEvents` in `events.ts:180-185`). No divergence.

## Tests (events.test.ts, 611 lines)
- `skeleton()` (lines 15-60) is exactly the fixture-building helper the task asked to check for — it already absorbs essentially all boilerplate; array-position tracking (`push` returning the pushed index) for expected `lineIndex` values is a nice touch that prevents hand-counted line numbers from silently desyncing.
- No further extraction needed: the repeated "refuses a wrong argument count, naming the map and line" tests (5 occurrences across warp/coord/bg/scene_script/callback, ~lines 79-108, 191-199) are structurally similar but each exercises a genuinely different macro/branch; a table-driven rewrite would save maybe 15-20 lines at the cost of a level of indirection for a file this size. Not worth it.
- Corpus assertions are appropriately specific (exact totals, exact per-map maxima, named maps) rather than vague — matches the corpus-tests style already established in `map.test.ts`/`tileset.test.ts`.
- No brittleness found: all fixtures go through `skeleton()`, no hand-typed line-number literals except the one `NewBarkTown` corpus test (line 495 on) — which is checking against the real committed file at fixed line numbers, which is inherently exact rather than brittle (it will correctly fail if the real `.asm` file's line numbers ever shift, which is exactly what it should do).

## Perf
- Full `npm test`: 6.02s, 285 tests, no slow-test warnings. `events.test.ts` alone: 621ms including 9 separate full-391-map corpus reloads. No action needed.

## Summary
No Critical or Important issues. 3 Minor/cosmetic items, none blocking:
1. `locateEventCall`'s refusal now surfaces as `labelTail: ...` rather than `locateEventCall: ...` (asm.ts:267) — slightly less specific error-message identity for Plan-7 callers reading only `e.message`.
2. `events.ts:26`'s doc comment overclaims style parity with `tileset.ts`'s `parsePaletteMap` (missing function-name prefix in practice).
3. `checkSectionOrder`'s two refusals (events.ts:104,107) omit a line number, inconsistent with every other refusal in the file, though not harmful.

**APPROVED**
