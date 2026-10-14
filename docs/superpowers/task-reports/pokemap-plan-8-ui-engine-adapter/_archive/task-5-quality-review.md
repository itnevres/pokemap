# Task 5 quality review (async state + tests)

Verdict: Quality Approved. 0 Critical / 0 Important / 5 Minor.

Focused run: GbcApp.test.tsx + packages/ui/test/shared + the shared witnesses, 97/97 pass at idle.

## Async-state analysis (no defects found)
- Stale closures: post captures mapName/seed at call time on purpose (the ticket records the request's identity); apply
  compares against `latest.current` at landing time. A stale `post` from a retired stroke fetches the right URL and is dropped
  because the ticket's map/seed differs from latest. Correct. apply's empty deps is safe: it reads only refs and the stable setter.
- Updater purity: the updater closes over the `current` snapshot, not the ref, and has no side effects. `seq.applied`
  mutates outside the updater. StrictMode double-invoke is safe.
- seq across discard: `applied = issued` retires every in-flight ticket, including other maps'. Monotonic counters mean
  no cross-map ordering hazard.
- Identity: grep of packages/ui/src finds no dep array using a family-hook method; the only hook-derived deps are
  `editSession.isDirty` / `session.isDirty` (App.tsx:86, GbcApp.tsx:118) and `session.isDirty` in useContextEditing.ts:44.
  GBA `call`, `callEvent` and the public methods now change identity on seed change (before: mapName only); GBC is
  unchanged in effect (before: mapName + initialBlocks). Nothing consumes them in effect deps, so nothing re-fires more often.
- Render count: GBA lost its reset effect (one extra render per map switch / refetch removed). The GBA seed is memoised, so
  `?? []` no longer churns. GBC's seed is memoised on [initialBlocks, initialEvents]; both come from one payload, so they change together.
- GbcApp "palette highlight resets" flake: the failing assertion (GbcApp.test.tsx:550) is the pre-switch hover-highlight waitFor, not the
  reset. I find no mechanism in this diff: blocks/events/post identities handed to GbcMapCanvas are stable between payload changes, and
  nothing session-side runs between the mouseMove and the check. It looks like the default 1s waitFor under full-suite load
  (jsdom canvas getContext stubs are noisy). It passes here. Coordinator's call; no code defect attributable.

## Minor
1. test/shared/useEditSessionCore.test.tsx:21-32, `it.each(["map","seed"])`: the "map" case also swaps in `nextSeed`
   (rerender always changes seed), so deleting the `current.mapName !== ticket.map` guard still passes via the seed check.
   Fix: keep `seed` unchanged when changed==="map". (GBA test 2 has the same property: mapB case also passes `seed` unchanged but a
   new `map` prop, so the seed is the same there and it does isolate map. Only the core test is affected.)
2. useEditSessionCore.ts discard (~line 60): after the await, `setStored(null)` is unconditional. If the user switches A->B while
   A's discard is in flight, it wipes B's live record, so B shows its seed while the server holds B dirty. GbcApp discards before
   switching so it cannot happen there; GBA App's Toolbar discard can. Guard with `latest.current.mapName === mapName`. Very narrow.
3. useEditSessionCore.ts:~28 `latest.current = ...` is a render-phase ref write; a discarded concurrent render can leave it ahead of committed
   state. Matches the pre-existing GBC pattern; fine today, note only.
4. useGbcEditSession.ts post: `const events = d.events` shadows the outer `events` from `state` (lint-shadow, readability); rename
   to `nextEvents`. Also the `{ readServerError }` option is a family-behaviour flag in the shared core; acceptable (documented in-code), but it is the one non-state
   concern in an otherwise clean core.
5. Test coverage gaps (not failures): no test for apply-without-ticket landing after a map switch with an in-flight ticketed reply, and GBC has only the
   discard witness (stale/out-of-order for GBC remain covered by the pre-existing useGbcEditSession tests). Deferred promises are flushed with
   awaited act() and no sleeps; assertions match titles; afterEach unstubAllGlobals present.

## Comments
Rewritten GBA discard doc stays accurate and keeps the "never route discard through the reply merge" warning. The long
reset-effect postmortem and its "documented clobber gap" were removed with the code they described; the GBC doc comment no longer
points at deleted lines. No stale references found. One pre-existing GBC comment (GbcMapCanvas.tsx:69) still describes "session hook re-seeds
in a later tick" for GBA; harmless.
