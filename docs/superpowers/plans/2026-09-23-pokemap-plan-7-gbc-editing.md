# PokeMap Plan 7 — GBC Editing (Pokémon Crystal write path)

> **For agentic workers:** REQUIRED READING FIRST: the roadmap (`2026-09-23-pokemap-plan-6-gbc-roadmap.md`, invariants G1-G7) and Plan 6 itself (`2026-09-23-pokemap-plan-6-gbc-foundation.md`) — this plan builds directly on Plan 6's loaders, renderer, and the two round-trip identity proofs (Task 2's binary codec, Task 4's no-op assembly splice). Written to TASK level, not full TDD-step — **re-read every task against the REAL code Plan 6 actually produced** (not this document's own assumptions about it) and re-granularise before executing, exactly Plan 0 §1's own established discipline. Do not start this plan until Plan 6 is merged and its own two round-trip identity tests are green across the real corpus.

**Goal:** Give the Crystal side of PokeMap its first write path — tile painting and event editing — mirroring GBA Plan 2's own scope (painting, event editing) but deliberately NOT porting collision/elevation painting as a literal feature: Crystal's own collision model (roadmap §0, G-family research) is a per-TILESET table, not a per-map-instance byte, so "paint collision on this map" has no direct target the way it does for GBA. If per-tileset collision editing turns out to be wanted, that is a distinct, later task — do not silently reinterpret it as per-instance painting just to reuse GBA's own UI pattern.

**Architecture:** Same shape as GBA Plan 2 — an in-memory `EditSession` lives server-side (`packages/server/src/gbcEditSessions.ts` or a family-aware branch of the existing store, Task 1 of this plan decides), the browser sends granular edit operations over HTTP, the server applies them via `core/gbc`'s own pure functions and stages a save plan; one save funnel is the only writer. The CLI needs no session (single Node process, same as GBA's own CLI write commands).

**Wild signs (GBA Plan 2's own Tasks 15-17) are explicitly OUT of scope for this plan** — that whole feature (wild Pokémon standing as an overworld sprite via a synthesized script) is GBA-engine-specific behavior; whether an equivalent exists/makes sense for Crystal's own engine is an open question for a future plan, not assumed here.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/gbc/write/guards.ts` | G4's real refusals: out-of-range metatile id, `.blk` length mismatch, event-section desync (if Plan 6 Task 1 found this is real), unknown map/tileset name |
| `packages/core/src/gbc/write/save.ts` | `EditSession`, `planSave`, `commitSave` — mirrors GBA's own `write/save.ts` shape, built on Plan 6 Task 2/4's already-proven codecs |
| `packages/core/src/gbc/edit/paint.ts` | Pencil/bucket/rect/shift over `Block[]` — same pure `(blocks, args) => Block[]` shape as GBA's own `edit/paint.ts`; no `dropper`-only concept change, but NO collision-cell variant (see Goal's own scope note) |
| `packages/core/src/gbc/edit/events.ts` | Add/move/delete object/warp/bg/coord events, producing `write/asmSplice.ts`-consumable edit ops instead of GBA's `JsonEdit`/`InsertOp` |
| `packages/server/src/gbcEditSessions.ts` (or family-aware branch) | In-memory session store, mirrors `editSessions.ts`'s own `open`/`close`/snapshot shape |
| Server routes (family-aware branch of `packages/server/src/index.ts`, or a sibling file) | `/api/gbc/edit/:map/paint/*`, `/event/*`, `/plan`, `/commit` — same route shape as GBA's own, same response conventions |
| `packages/ui` components | Reuse GBA's own `Toolbar`/`MetatilePalette`/`SaveDialog`/`EventInspector` SHELLS where the interaction pattern genuinely transfers (click/drag paint, event select/move/add/delete, save-diff-preview) — family-aware data plumbing underneath, not a forked UI component tree. A component that assumes GBA-only concepts (e.g. `CollisionPalette`) is NOT reused for Crystal per this plan's own scope note. |
| `packages/cli` | `gbc paint`, `gbc event add/move/delete`, `gbc diff` — mirrors GBA's own dry-run-by-default/`--yes`-to-commit CLI write commands exactly (I6/G6 extended to the CLI, same reasoning) |

---

## Task 1: Save guards + EditSession/save funnel (written first — everything after depends on being unable to do damage)

Direct port of GBA Plan 2's own Task 1+4 shape, built on Plan 6's already-proven codecs:
- `guardBlockSave`-equivalent: refuse an out-of-range metatile id (against the OWNING tileset's real cap, no split to resolve per G1) before it ever reaches `encodeBlk`.
- `guardMapSave`-equivalent: whatever G4 refusals Plan 6 Task 1's research surfaced as real (event-count desync, etc.) — if that research found NO real desync risk (assembler-computed lengths, nothing to guard), this guard may be much thinner than GBA's own warp-tile-moved check; do not invent a refusal condition that doesn't correspond to a real risk just to mirror GBA's own shape.
- `EditSession`: `mapName`, `blocks: Block[]`, `originalBlocks` (deep copy, same aliasing-hazard discipline as GBA's own `EditSession.originalBlocks` doc comment — this is a real, easy-to-get-wrong mistake class, re-read that doc comment before writing this one), `map`/`originalMap` (event data), `originalAttributesText`/`originalEventBlockText` (the raw source text Plan 6 Task 4's splicer operates on — this session's own equivalent of GBA's `originalMapJson`), pending edit ops, `isDirty`.
- `planSave`/`commitSave`: same "compute what would change, without writing" / "the ONLY function that writes" split as GBA's own `save.ts`, using Plan 6 Task 2's binary encoder and Task 4's splicer as the two write mechanisms (never a third path re-implementing either — same rule GBA Plan 2's own Task 18 stated explicitly for its CLI).

**Teeth-proof, same discipline as every GBA Plan 2 task:** temporarily break a guard, confirm the test that should catch it actually goes red, revert.

---

## Task 2: Paint tools — pencil/rect/bucket/shift

`edit/paint.ts`: same four tools as GBA's own (`paintCells`/`floodFill`/`shiftGrid`), operating on GBC's own simpler `Block` shape (`{metatileId}` only, no collision/elevation fields to preserve-or-overwrite the way GBA's own stamp-merge logic needs to). This should be a SMALLER, simpler file than GBA's own `edit/paint.ts` — if it isn't, that's a signal the `Block` type carried more than G1/G2's own research justified; re-check against Plan 6's real `model/types.ts` before assuming parity with GBA's own complexity.

---

## Task 3: Event editing — add/move/delete

`edit/events.ts`: mirrors GBA's own `moveEvent`/`addEvent`/`deleteEvent` shape, producing edit operations Task 4's server routes stage against `write/asmSplice.ts` instead of `jsonEdit.ts`. Warp-renumbering footgun (GBA's own `findWarpsTargetingByIndex`) — verify whether Crystal's own warp-target format is ALSO positional-index-based (same footgun) or references warps some other way (e.g. by label) before assuming this exact warning is needed; if the format differs, the warning mechanism needs its own re-derivation, not a copy-paste.

---

## Task 4: Server session store + routes

Direct port of GBA Plan 2's own Task 8/9 shape (`open`/`close`, `paint/begin`/`apply`/`end`, `undo`/`redo`, `event/move`/`add`/`delete`, `plan`, `commit`) against this plan's own `EditSession`. Same response-shape conventions (`sendSession`-equivalent). Family routing decision from Plan 6 Task 1 determines whether these are literally `/api/gbc/edit/:map/*` or some other disambiguation — follow whatever Plan 6 actually decided, don't re-decide here.

---

## Task 5: UI wiring — paint tools, event inspector, save dialog

Mount the GBC-family editing UI against a real Crystal project. Reuse GBA's own component SHELLS (`Toolbar`, `MetatilePalette`, `SaveDialog`, `EventInspector`) with family-aware data underneath wherever the interaction genuinely transfers (confirmed by Plan 6's own research: paint/click/drag, event select/move/add/delete, and the save-diff-preview flow are all structurally the same UX even though the underlying data shapes differ) — do NOT mount `CollisionPalette` for this family (no per-instance collision to paint, per this plan's own Goal section). Every UI task invokes `frontend-design`/`ui-ux-pro-max` first, per Plan 0 §4's own convention, extended to this family without change.

**Live-verify against the real subject repo, with the required I8-equivalent (G7) revert-after check** — same discipline as every GBA Plan 2 write-path task: paint a tile, confirm `git diff` in `pokecrystal-PerfPlus` shows only the expected bytes changed, then `git checkout --` to restore, confirm `git status --porcelain` matches the pre-existing baseline before and after.

---

## Task 6: CLI write commands

Direct port of GBA Plan 2's own Task 18 shape (`gbc paint`, `gbc event add/move/delete`, `gbc diff` — dry-run by default, `--yes` to commit, thin action handlers delegating to exported testable functions). Same I6/G6-extended-to-the-CLI reasoning GBA's own Task 18 documented explicitly.

---

## Task 7: Extend the round-trip identity gate to real writes (the merge gate for this plan)

Direct analog of GBA Plan 2's own Task 19 — **the actual merge gate for this whole plan**, per roadmap §2's own G5 rule. Extends Plan 6's Task 2/4 identity tests with: a full paint→commit→restore round trip through the REAL save funnel (mirroring GBA Task 19's own "paints one real block, commits through the full save funnel, restores byte-identical" test, generalised across the whole Crystal corpus and, if a vanilla `pokecrystal` reference checkout is available per roadmap §5, that engine too), and the equivalent for a real event add/move/delete through `write/asmSplice.ts`.

**Apply every lesson this project's own history already paid for, explicitly, rather than re-discovering them:**
- Grep `packages/*/test/**` for any map/route name this task's own tests are about to use against the real repo, before finalizing the test file — the cross-package test-map-name-collision hazard bit the GBA side of this project FIVE separate times across Task 18/19 alone (see `docs/superpowers/RESUME.md`'s own "Lessons from Task 18/19" section) and is not GBA-specific; it will recur here on the exact same class of mistake if not checked proactively.
- Restore only what a test actually wrote, read-guarded, not an unconditional restore of files the write funnel never touched — the exact class of bug GBA's own live-render follow-up shipped and had to fix twice (`docs/superpowers/RESUME.md`'s own "Lessons from the Plan 2 follow-ups" section).
- Pin real measured values for every floor/count assertion (verified against the real corpus, not guessed) — Plan 0 §7's own test-design rules apply unchanged to this family.

---

## Self-review checklist (fill in when re-granularising before execution)

- [ ] Every task re-checked against Plan 6's REAL produced code (types, function signatures, file paths) — not this document's own assumptions about what Plan 6 would produce.
- [ ] Collision/elevation-painting scope note (this plan's own Goal section) respected in every task — no task silently reintroduces a per-instance collision concept Crystal's own format doesn't have.
- [ ] Wild-sign scope exclusion (this plan's own Goal section) respected.
- [ ] Task 7's own gate genuinely covers binary AND assembly-splice writes, generalised across the whole real corpus, not a single hand-picked example.
