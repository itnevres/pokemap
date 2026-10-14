### Task 5: Shared edit-session core. Risk: medium (async state)

**Files:**
- Create: `packages/ui/src/shared/useEditSessionCore.ts` and its test.
- Modify: `hooks/useEditSession.ts` and `gbc/hooks/useGbcEditSession.ts`. Both keep their exported result interfaces exactly, since `UseEditSessionResult` and `UseGbcEditSessionResult` are consumed widely.

**Interfaces (produces):**

```ts
export interface EditSessionCore<State> {
  state: State | undefined;               // family payload: GBA {blocks,border,map}, GBC {blocks,events}
  isDirty: boolean; canUndo: boolean; canRedo: boolean;
  post<R>(path: string, body?: unknown): Promise<R>;   // keeps the `latest.current.mapName === mapName` response guard
  apply(next: Partial<{ state: State; isDirty: boolean; canUndo: boolean; canRedo: boolean }>): void;
  discard(): Promise<void>;               // restores the seed, throws on !ok (both hooks' documented contract)
  markClean(): void;
}
export function useEditSessionCore<State>(base: string /* "/api/edit" */, mapName: string | null, seed: State | undefined): EditSessionCore<State>;
```

- [ ] **Step 1:** Write the core tests:
  - the response guard drops a stale map's reply;
  - discard restores the seed and never blanks it (the regression documented in `useEditSession.ts` `discard`);
  - discard throws on a non-ok response;
  - `markClean` keeps the state;
  - undo/redo flags come from the server reply.

  Run them and confirm they fail.
- [ ] **Step 2:** Implement the core. Re-express both hooks over it. `useEditSession.test.tsx`, `useGbcEditSession.test.tsx` and all consumers stay unchanged.
- [ ] **Step 3:** Teeth-proof:
  - remove the response guard;
  - discard to an empty grid;
  - discard swallows `!ok`.

  Each must kill tests in both families.
- [ ] **Step 4:** Gate. Live check: paint, undo, redo and save round trip in both families, with `cmp` after a reverse edit.
- [ ] **Step 5:** Commit.

