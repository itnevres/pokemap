## Global constraints

- **Order:** Plan 7 merged to `master` 2026-10-12 (`dbb1761`). Branch `plan-8-ui-engine-adapter` from `master`.
  - Issues #5/#6 (branch `issues-5-6-warp-popups`, uncommitted, unverified) edit the same paired files in both families.
  - The user decides at preflight: land #5/#6 first, then rebase it onto Plan 8's shared modules; or park it until Plan 8 finishes. Do not do both lines at once.
- **Behaviour:**
  - No user-visible behaviour change, except the named fixes (F6, F3/M4, M3, M5, M6). Each named fix gets its own new tests in **both** families.
  - The DOM structure, class names and ARIA names that existing tests and `DESIGN.md` rely on stay as they are.
- **Test oracle:** every existing test file stays unchanged unless a named reason is recorded in that task's coordinator report. Check: `git diff <task-base> -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` lists only named lines. Note that a bare `packages/*/test` pathspec silently matches nothing.
- **Dependencies:** no new runtime or dev dependencies.
- **Server:** no server, core or CLI changes, except a strictly additive export a shared hook needs.
- **Gate before every commit:**
  - `npm test` (one run, captured to a file);
  - `npm run typecheck`;
  - `npm run build -w @pokemap/ui`.
  - Never run two full suites at once. Commit with pathspecs only.
- **Never** use `git checkout`, `git restore` or `git stash` to undo experiments. Mutations restore from in-memory bytes in `finally` and byte-compare.
  - The classifier counts `AssertionError`, `expected` and `TestingLibraryElementError` as kills.
  - Run mutations in their own scratch worktree (`git -c core.longpaths=true worktree add --detach <scratch>/m HEAD` plus `npm ci`).
  - Tell reviewers which directories they must not write.
- **Real corpora:**
  - Any test that a mutation could turn into a write uses `copyGbcSubjectToTemp` (GBC) or a scratch-root fixture (GBA, as in `packages/server/test/world.test.ts`).
  - PerfPlus must end clean with no `.pokemap`.
  - GBA `.pokemap/world.json` stays `9c8ab2a…` unless the user changes it.
- **Live checks:**
  - Scratch hub on 5184 via `C:\Users\Serve\AppData\Local\Temp\pokemap-phase-d-coordinator\preload.mjs` with a scratch `POKEMAP_HOME`.
  - Vite on 5183 via a copy of that folder's `vite.mjs`, pointed at the tree under test.
  - Use Playwright MCP `browser_run_code_unsafe`, and check `document.visibilityState` before each write.
  - Take byte snapshots before writes, do the reverse edit through the UI, then `cmp`.

## Review focus

Most likely to bite a user first. Each line names its owning task, which must carry the test.

1. **Heavy-canvas remount.** A shared component that restructures JSX can remount the world or map canvas. That loses the view, refetches `/api/world`, and blanks the overlay. Expected: DOM node identity is kept across context entry and exit in both families (Tasks 2, 3, 6).
2. **Wrong native scale per family.** A shared hook defaults to GBA 16 px and GBC silently snaps to the wrong zoom, or the reverse. Expected: per-family snap tests at world zoom 32/64/128 (GBC) and 16/32/64 (GBA) (Task 2).
3. **Map switch or unmount mid-stroke in GBA, which now gains B1.** Expected: the queued applies of the retired visit are dropped, a begun stroke is still ended, and no error is shown for the retired visit (Task 1).
4. **Lost mouseup** (window blur, a native drag hijack), then a new mousedown. Expected: the previous stroke's end reaches the server before the new begin, so the two strokes are two undo steps (Task 1).
5. **Escape while a modal or menu is open, after the shared capture-phase listener.** Expected: Escape closes only the modal or menu, in both families, including the React-flush case where a document listener removes the modal first (Task 2).

---

### Task 1: Shared stroke chain (absorbs F6, F3/M4, M3). Risk: high (concurrency)

**Files:**
- Create: `packages/ui/src/shared/useStrokeChain.ts`, `packages/ui/test/shared/useStrokeChain.test.tsx`.
- Modify: `packages/ui/src/gbc/GbcMapCanvas.tsx`. The B1 code is now `pendingPaintRef`, `strokeRef`, `canvasVisitRef`, the layout-effect retirement and `endActiveStroke`, at about `:300-319` and `:616-725`. It moves out.
- Modify: `packages/ui/src/components/MapCanvas.tsx`. Its `pendingPaintRef`/`beginStroke().then` chain and `endActiveStroke` (about `:235-280` and `:681-857`) are replaced.
- Test: new GBA cases in `packages/ui/test/MapCanvasStroke.test.tsx` (new file). Existing `MapCanvas*.test.tsx` and `GbcMapCanvasEdit.test.tsx` stay unchanged.

**Interfaces (produces; binding):**

```ts
// packages/ui/src/shared/useStrokeChain.ts
export interface StrokeSession<Body> {
  beginStroke(): Promise<void>;
  applyPaint(body: Body): Promise<unknown>;
  endStroke(): Promise<void>;
}
export interface StrokeChain<Body> {
  /** mousedown: ends any still-open stroke first (F3/M4), then begin, then `first` (if any) as one awaited link. */
  start(session: StrokeSession<Body>, first: Body | null): void;
  /** held move: queued behind every earlier link; dropped if the visit retired or begin failed. */
  queue(body: Body): void;
  /** mouseup/mouseleave: `last` (rect/shift final apply, or null), then end, after every queued link. */
  finish(last: Body | null): void;
  isOpen(): boolean;
  /** Resolves when every link issued so far has settled (Task 3 uses it for M5). */
  settled(): Promise<void>;
}
/** `visitKey` = the map name. A change or unmount retires the visit: queued work drops, a begun stroke still ends. */
export function useStrokeChain<Body>(visitKey: string, onError: (message: string) => void): StrokeChain<Body>;
```

The rules carried over from B1 (`b0f448a`) and now binding for both families:
- Each link awaits its round trip.
- Every assigned chain ends with a terminal `.catch(() => {})` after the guarded error report. A throwing `onError` can no longer poison the chain (M3).
- Errors from a retired visit are not reported.

- [ ] **Step 1:** Write `useStrokeChain.test.tsx` with held (deferred) promises. Cases:
  - begin before first apply;
  - each apply round trip before the next;
  - end after the last apply;
  - the next stroke's begin after the previous end;
  - retirement at begin, at apply and at end, for map change, A→B→A and unmount;
  - a lost mouseup (`start` while open), which must issue the old end before the new begin;
  - a throwing `onError`, after which a later stroke still paints;
  - `settled()` waits for a held apply.

  Use `await act(async () => {})` before every negative assertion: queued links run in microtasks.
- [ ] **Step 2:** Run it and confirm it fails (the module is missing).
- [ ] **Step 3:** Implement it by moving GBC's B1 logic. Do not reinvent it.
- [ ] **Step 4:** Make `GbcMapCanvas` consume the chain. All existing GBC tests must stay unchanged and green.
- [ ] **Step 5:** Write the GBA tests in `MapCanvasStroke.test.tsx`, mirroring the GBC B1 witnesses (`GbcMapCanvasEdit.test.tsx`, its `held()` cases): held begin, held first apply, three held drag applies, held end before the next begin, map/ABA/unmount retirement. Run them and confirm they fail on current GBA (F6).
- [ ] **Step 6:** Make `MapCanvas` consume the chain. The GBA body type is `PaintApplyBody` from `hooks/useEditSession.ts`. The new tests pass and all existing GBA tests stay unchanged and green.
- [ ] **Step 7:** Teeth-proof in the mutation worktree. Each of these must kill tests in both families' suites:
  - begin not awaited;
  - move apply not chained;
  - end not awaited;
  - retired visit still paints;
  - no lost-mouseup end;
  - no terminal catch.
- [ ] **Step 8:** Gate. Live check in **both** families: a rapid click and a three-block drag. Watch the request order (`begin, apply…, end`) with Playwright `page.on('request')`. Do a reverse edit and `cmp`.
- [ ] **Step 9:** Commit.

Reviews: split spec (Opus) and quality (Sonnet), because this is concurrency.
