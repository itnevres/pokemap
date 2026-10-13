# Task 4 review (merged spec + quality), 5302ac1..95ddd81

## Verdict
A. Spec compliance: PASS. B. Quality: Approved. 0 Critical / 0 Important / 3 Minor.

## A. Spec compliance
Files touched are exactly the six the spec lists (useGuardedFetch.ts +3, useMapGroups.ts, useCoverage.ts, three new tests). No existing test changed (test stat: 3 new files, 199 insertions, 0 deletions). No deps, server, core or CLI change. GBC hooks, dungeons, map-layout untouched (R5). R1-R5 implemented as written: `unguarded` is module-level (stable effect dep), exact name, one-line doc comment. Both exported interfaces kept; long `CoverageResponse` comment kept; unused react imports dropped. StrictMode witnesses use `reactStrictMode: true` per the ledger ruling.

### Independent re-check of GBA useMapGroups/useCoverage vs the useGuardedFetch wrappers (old source from 5302ac1)
- fetch call: old `fetch("/api/x")`, new `init ? fetch(url,init) : fetch(url)` with init undefined = one arg. Same.
- Error text: old `GET /api/x -> N`; new `${"GET"} ${label ?? url} -> N` = same. Fetch rejection and `r.json()` rejection both reach `.catch` with the same message.
- Guard: `unguarded` always true, so no "unexpected shape" error can arise; a `null`/odd body is set as data exactly as before.
- Effect deps: old `[]`; new `[url, guard, label]` with constant url, module-level guard, undefined label, so mount-only. No refetch per render.
- Reset-on-mount: new effect calls setData(null)/setError(null) at start; state is already null at mount (bail-out, no extra render). Under StrictMode the re-run resets again; harmless.
- Cancellation: identical `cancelled` pattern in the shared hook.
- Result shape `{data,error}` structurally identical to `UseMapGroupsResult`/`UseCoverageResult`. Consumers (App.tsx:40, WorldCanvas.tsx:497) only destructure data/error. No new behaviour difference found.

### Left-alone pairs (stop rule), re-derived
- useDungeons/useGbcDungeons: correct to leave. Spec table understates it slightly: GBC guards EVERY response (isDungeons list, isDungeon on POST/PATCH, isDeleted on DELETE) and uses fetchGuarded; GBA casts all of them. Plus the label difference (raw id vs encoded URL) the spec names. Not a type-only difference.
- useMapLayout/useGbcMap: correct to leave. GBA keeps previous `data` while the next map loads (effect never nulls data on name change, only when name is null) and exposes `loading`; GBC resets via useGuardedFetch and exposes `reload` with forBase. Both claims confirmed in source.
- Coverage/groups merge verdict confirmed (GBC differs only by guard, now bridged by `unguarded`).

## B. Quality
Tests assert what their titles say. Teeth: the stale-guard tests rely on the mutation proof in the report (removing `if (!cancelled)` fails the shared key-change test and all four StrictMode witnesses), which shows the double `await act(async () => {})` flush is sufficient to let a late A land; the order (resolve B, waitFor, resolve A, flush, assert) is correct. StrictMode mock order is right (first effect's fetch = first mockReturnValueOnce, cancelled by cleanup). The `fetchMock` toHaveBeenCalledTimes(2) assertion pins that the StrictMode double effect actually happened, so the witness cannot silently degrade to a single fetch.

### Minor
- M1 packages/ui/src/hooks/useCoverage.ts (hook doc, replaced) and useMapGroups.ts: useful doc comments were dropped. useCoverage lost "server caches coverage(project), it walks all 497 tables, so fetch-once-per-mount is enough"; useMapGroups lost the extraction history. Spec R3 said to "update" the comment; the one-liner replaces rather than amends. Scenario: a later reader wonders why coverage is not refetched or polled. Suggest keeping the 497-table sentence.
- M2 packages/ui/src/hooks/useGuardedFetch.ts:57 and :84 (and gbc/hooks/useGbcGroups.ts:14): comments still say the hook "useMapGroups.ts established" / "mirrors useMapGroups.ts exactly". After this task useMapGroups wraps this hook, so the lineage reads backwards. Cosmetic.
- M3 packages/ui/test/useFetchedFamilyGba.test.tsx (no test): nothing pins that the wrapper does not refetch on rerender (stable `unguarded` identity). An inline arrow regression would pass every new test, since StrictMode tests count only mount fetches and no test rerenders the wrapper. Add one `rerender()` + `toHaveBeenCalledTimes(1)` case if desired. Also `deferred`/`response` helpers are copied in all three test files (YAGNI-acceptable; a shared helper would touch test oracle conventions, so leaving it is defensible). Test 3 (GBC) duplicates GBA tests 2(a)/(b) by design of the spec.

### Not verifiable from diff
- ⚠️ Cannot verify from diff: the mutation-proof and RED/GREEN logs (task-4-mutation.log etc.); taken from the report plus coordinator's gate (2,667 pass, typecheck/build pass, oracle empty).
- ⚠️ Cannot verify from diff: that `isGbcCoveragePayload` accepts the GBC coverage fixture; the passing waitFor on `data` equal to coverageB implies it does.
