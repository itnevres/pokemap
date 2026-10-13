# Task 5 executed spec (coordinator, 2026-10-13)

BASE: d37959e. Plan text: `task-5-brief.md`. Where this spec and the brief differ, this spec wins.
Sources: `packages/ui/src/hooks/useEditSession.ts` (GBA, 353 lines), `packages/ui/src/gbc/hooks/useGbcEditSession.ts` (GBC, 159 lines).

## What the two hooks share today, and what differs

Shared: POST `/api/edit/<encoded map><path>`; `mapName === null` makes every call a network-free no-op; `discard` POSTs `/discard`, throws `POST /api/edit/<map>/discard -> <status>` on !ok, and on success shows the seed (never `[]`); `markClean` clears the three flags and keeps the state; flags come from the server reply.

Family-only (stays in the family hook):
- request bodies and route list;
- GBC: the `isSessionBody` shape check; "`events: null` = closed session, leave the client as is"; the server's `{ error }` text on a non-ok reply;
- GBA: event routes reply `{ map, isDirty }` only, flags synthesised `canUndo=true, canRedo=false`; `applyExternalMapUpdate`; `d.map === undefined` = keep map, `null` = `undefined`; the nothing-open undo reply (`blocks: []`) is applied as is (existing behaviour, not fixed here).

## Rulings

- **R1: the core adopts GBC's state model for both families.** One stored record `{ forMap, seed, state, isDirty, canUndo, canRedo }`, derived at render. It is "live" only when `forMap === mapName && seed === <current seed>` (identity). Otherwise the hook shows the seed with all flags false. No reset effect: GBA's `useEffect` reset (lines 209-241) is deleted.
- **R2: the response guard is a ticket.** `post` captures `{ map, seed, seq }` at issue (`seq = ++issued`). A reply is applied only if, when it lands, `latest.mapName === ticket.map && latest.seed === ticket.seed && ticket.seq > applied`; then `applied = ticket.seq`. This is GBC's guard (lines 102-124) unchanged.
- **R3: consequences for GBA, accepted as the plan's intended sharing of the guard.** Each is pinned by a new GBA test (Tests 2):
  - (a) an older same-map reply landing after a newer one is dropped;
  - (b) a reply issued before a seed change (refetch after commit) is dropped;
  - (c) an event-op reply (`/event/*`) landing after a map switch is dropped (today GBA's `callEvent` applies it unguarded into the next map);
  - (d) after a successful discard, an op still in flight cannot resurrect the session (`applied = issued`);
  - (e) no stale render of the previous map's blocks after a switch (the effect's one-render window).
  Cost if wrong: GBA race-edge behaviour differs from before in these five cases only.
- **R4: interface** (adapts the plan's sketch; reasons inline).
  ```ts
  export interface EditFlags { isDirty: boolean; canUndo: boolean; canRedo: boolean }
  /** `state` is an updater, not a value: GBA merges partial replies (`map` absent = keep). */
  export type EditUpdate<State> = { state?: (prev: State) => State } & Partial<EditFlags>;
  export interface EditTicket { readonly map: string; readonly seed: unknown; readonly seq: number }
  export interface EditSessionCore<State> extends EditFlags {
    /** Live state, else the seed. */
    state: State;
    /** null when mapName is null (no fetch). body === undefined sends exactly `{ method: "POST" }`;
     *  otherwise `{ method: "POST", body: JSON.stringify(body) }`. On !ok throws (see below). Never applies anything. */
    post<R>(path: string, body?: unknown): Promise<{ data: R; ticket: EditTicket } | null>;
    /** With a ticket: applies only if the R2 guard passes; returns whether it applied.
     *  Without: applies to the current map/seed unconditionally (GBA applyExternalMapUpdate); returns true. */
    apply(update: EditUpdate<State>, ticket?: EditTicket): boolean;
    /** No-op when mapName is null. Throws `POST <base>/<map>/discard -> <status>` on !ok, state kept.
     *  On success: applied = issued, stored = null (the seed shows). */
    discard(): Promise<void>;
    /** stored === null ? no-op : flags false, state kept. No network. */
    markClean(): void;
  }
  export function useEditSessionCore<State>(base: string, mapName: string | null, seed: State, opts?: { readServerError?: boolean }): EditSessionCore<State>;
  ```
  - `seed` is `State` (both families always pass one), not `State | undefined`.
  - Applying to a non-live stored record starts from `{ forMap, seed, state: seed, flags false }`.
  - Error text on !ok: if `opts.readServerError` and the body parses to `{ error: string }`, that string; otherwise `POST ${base}/${mapName}${path} -> ${status}` (raw, unencoded map name: both hooks' current text). With `readServerError` false the body is NOT read (GBA never reads it today). GBC passes `{ readServerError: true }`. Parse the body at most once per reply.
  - `base` is `"/api/edit"` in both families.
- **R5: family seeds are memoised.**
  - GBA: `useMemo(() => ({ blocks: initialBlocks ?? [], border: [], map: initialMap }), [initialBlocks, initialMap])`.
  - GBC: `useMemo(() => ({ blocks: initialBlocks ?? [], events: initialEvents ?? NO_EVENTS }), [initialBlocks, initialEvents])`.
  - GBC keyed only `initialBlocks` before; in practice both arrive together from one payload. Cost if wrong: a GBC events-only seed change would reset the live view.
- **R6: family hooks keep every exported name, type and doc comment** (`UseEditSessionResult`, `UseGbcEditSessionResult`, `PaintApplyBody`, `GbcPaintBody`, the re-exports). Rewrite comments that described the deleted reset effect, `call` or `callEvent` internals so they point at the core. The `discard` postmortem comment on `UseEditSessionResult` stays: it is the contract. Request URLs, bodies (GBA always sends a body, `{}` when none) and the methods' resolved values stay byte-identical.
- **R7: no other behaviour change.** Existing test files stay byte-unchanged and all must pass.

## Tests (write first; save RED to task-5-red.log)

1. `packages/ui/test/shared/useEditSessionCore.test.tsx` (core, with a small `State = { n: number }`):
   - (a) response guard: post on map A, rerender to B, resolve A's reply; `apply(..., ticket)` returns false and state is B's seed;
   - (b) stale seed: post, rerender the same map with a new seed object, resolve; apply returns false;
   - (c) out of order: two posts, resolve the second then the first; only the second's update shows;
   - (d) discard restores the seed after an applied update (never something empty), flags false, fetch called with `/api/edit/<map>/discard` and `{ method: "POST" }`;
   - (e) discard throws `POST /api/edit/A/discard -> 500` on !ok, and the applied state is kept;
   - (f) a reply in flight across a successful discard is not applied (R3d);
   - (g) markClean keeps state, clears flags, no fetch; markClean before anything applied is a no-op;
   - (h) flags come from the update (`apply({ isDirty: true, canUndo: true, canRedo: false })`);
   - (i) null map: post resolves null and discard resolves; fetch never called;
   - (j) error text: without `readServerError`, a 400 with `{ error: "nope" }` throws `POST /api/edit/A/x -> 400` and never calls `json`; with it, throws `nope`;
   - (k) body handling: `post("/x")` calls fetch with exactly `{ method: "POST" }`; `post("/x", {})` with `{ method: "POST", body: "{}" }`;
   - (l) apply without a ticket lands on the current map.
2. `packages/ui/test/useEditSessionShared.test.tsx` (GBA witnesses for R3; use the `Host` pattern from `useEditSession.test.tsx`):
   - (a) out-of-order paint replies: only the newer applies (R3a);
   - (b) a `moveEvent` reply for map A landing after switching to B leaves B's seed map (R3c);
   - (c) a reply in flight across `discard()` is not applied (R3d);
   - (d) after a map switch, the very first render shows the new seed (R3e): assert synchronously after `rerender`, with no `waitFor`.
3. `packages/ui/test/gbc/useGbcEditSessionShared.test.tsx` (GBC): one case, a reply in flight across `discard()` is not applied (same as 2c), so the R3d witness exists in both families. The existing `test/gbc/useGbcEditSession.test.tsx` already pins GBC's guard, out-of-order, discard and markClean.

RED: the core tests fail (no module); 2(a)-(d) should fail on BASE (R3 changes); 3 may already pass (GBC has the rule). Record honestly.

## Teeth (coordinator, after commit; each must kill in both families)
Remove the R2 guard; discard stores an empty state instead of null; discard swallows !ok.

## Oracle
`git diff d37959e -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` prints nothing.

## Files touched (exactly)
`packages/ui/src/shared/useEditSessionCore.ts` (new), `packages/ui/src/hooks/useEditSession.ts`, `packages/ui/src/gbc/hooks/useGbcEditSession.ts`, the three new test files, and the report and logs in this folder.
