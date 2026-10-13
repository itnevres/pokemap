# Task 5 fix round 1 re-review

1. GBA discard !ok witness: ADDRESSED. useEditSessionShared.test.tsx (new case at top of describe, ~lines 26-45): dirties via paint, catches the rejection, asserts Error and exact message "POST /api/edit/A/discard -> 500" (matches core useEditSessionCore.ts:67 with base "/api/edit"), asserts blocks/isDirty kept. Coordinator mutation proof accepted.
2. Core map guard isolation: ADDRESSED. useEditSessionCore.test.tsx:~26 `nextSeed = changed === "map" ? seed : { n: 2 }` keeps the identical seed object for the map case; final `toBe(nextSeed)` still valid. Implementer's mutation (removing the map clause) fails only the map case.
3. Shadowed `events` rename: ADDRESSED. useGbcEditSession.ts:~99-100 `nextEvents`, used as `events: nextEvents`; the outer destructured `events` is no longer shadowed. Behavior unchanged.

New breakage: none (diff is one test added, one test line changed, one local rename).
