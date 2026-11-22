# Plan 3: Task 10, extend the corpus gate (cancelled)

Cancelled by D22: each plan that adds a writer extends the corpus gate (`packages/core/test/write/corpus.test.ts`) itself. Text as it stood at `a533694`.

## Task 10 (DELETED, D22): Extend the corpus gate

**Deleted 2026-11-13.** Each plan that adds a writer extends the corpus gate for its own file types (roadmap D22). The text below is kept for the record.

**Files:** Modify `packages/core/test/write/corpus.test.ts`

Add to the existing gate: region map files, tileset binaries, `layouts.json`, and `map_groups.json` — load and re-save every one across all reference engines, zero bytes changed.

By the end of this plan the gate covers every file type PokeMap can write. That is the point at which "it cannot rewrite your schema" stops being a design intention and becomes a tested property.
