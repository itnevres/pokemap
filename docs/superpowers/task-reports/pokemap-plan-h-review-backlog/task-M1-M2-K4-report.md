# Plan H M1, M2, K4 (overnight stream D)

**Tier: Low** (isolated, fully specified, no trigger). Implemented by a Claude Haiku subagent from a complete brief (delegate Haiku lane: 1-2 line edits per file); no review dispatched (Low, nothing a test would not catch).

- **K4:** deleted `VERSION` from `packages/core/src/index.ts:1`; `git grep VERSION -- packages` found no reference.
- **M2:** `aria-label="Search by hex id"` on the palette search input (`packages/ui/src/shared/PaletteFrame.tsx`); test "names the search input by its accessible label" in `packages/ui/test/shared/PaletteFrame.test.tsx`.
- **M1:** `@media (prefers-reduced-motion: reduce)` block after the global `:focus-visible` rule in `packages/ui/src/styles.css`; pinned in `packages/ui/test/styles.test.ts`.

**Evidence**
- Targeted: `npx vitest run --no-file-parallelism packages/ui/test/shared/PaletteFrame.test.tsx packages/ui/test/styles.test.ts`: 2 files, 26 pass.
- Gate at `4df957a` (`npm test -- --no-file-parallelism`, under the machine-wide test lock): 5,153 pass / 1 fail / 273 files; typecheck pass, UI build pass; subjects unchanged. The fail is the known `core/test/config/engine.test.ts` env fail (RESUME, Plan 14.2 bullet).
- Live check (worktree server + Vite, built from this branch, verified by reading the served source): GBA (`Pokemon Game/game`) and GBC (`pokecrystal-PerfPlus`) map view each show one palette search textbox with accessible name "Search by hex id"; the reduced-motion rule is loaded in the live stylesheet in both.
