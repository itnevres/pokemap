# Plan H: review findings and where each one went

The 2026-11-12 code review on `plan-14-2-block-editor` at `b0b697e`, mapped to Plan H tasks (2026-11-13), and the items folded into other plans or not planned. History; the live plan is [plan-h-hardening.md](../plan-h-hardening.md).

Ids match the 2026-11-12 review report (S security, R refactor, U UI, P plans). The number is the report's checklist item.

| # | Finding | Task |
|---|---|---|
| 1 | S1 species icon route path traversal | E |
| 2 | S3 unbounded request body; `nosniff` | E |
| 3 | S4 GBA routes laxer than GBC | E |
| 4 | S6 `npm audit fix` (non-breaking) | L1 |
| 5 | U2 reduced motion; U6 palette search label | M1, M2 |
| 6 | R5 `errorMessage`; R7 `hex`, `isRecord` | K1, K2 |
| 7 | Stale status lines in RESUME and the roadmap | done 2026-11-13 |
| 8 | P7 `CLAUDE.md` and `AGENTS.md` duplicate each other | K5 |
| 9 | R11 dead code | K4 |
| 10 | S2 decomp-sourced paths not contained | F |
| 11 | R10 GBA map cache after a save (suspected) | G |
| 12 | R1 routes written twice | H |
| 13 | S5 POSTs sent as `text/plain`; R6 two fetch styles | J |
| 14 | P1-P5 Plan 3 and Plan 5 overlap the roadmap | done 2026-11-13 (roadmap D22) |
| 15 | S7 Google Fonts request on every launch | M3 |
| 16 | R3 two session stores; R4 paint written twice | I2; roadmap Plan 14A |
| 17 | R2 one 1,065-line request handler | I1, I2 |
| 18 | S6 `vitest` 2 → 5 | L2 |
| 19 | U1 no responsive layout; U3 map canvas is mouse-only | N |
| 20 | R8 no `gba/` folders, no public core surface | P3 |
| 21 | U4 unreachable light theme; U5 one global stylesheet | N; O |
| 22 | No lint, no CI | P1, P2 |
| - | P6 discard waits for strokes (Task C and RESUME's Plan 8 item) | C |
| - | R9 test-only cache in production code | K3 |
| - | U7 `WorldSurface.tsx` 934 lines | roadmap Plan 14C, first UI task (D24c) |
| - | U8 no request cancellation | not planned (see the end of this document) |
| - | Plan 14.2 final review carry-over (2026-11-20) | Q |

## Folded into other plans, or not planned

- **R4, `paintCells` and `floodFill` written twice** (`packages/core/src/edit/paint.ts:36-87`, `packages/core/src/gbc/edit/paint.ts:23-72`): the first task of roadmap Plan 14A, which builds stamps on painting in both families. One generic version copies only the keys the existing block already has; the GBC file re-exports it, as it already does for `readBlock` and `shiftGrid`.
- **U7, `canvas/WorldSurface.tsx` is 934 lines** (937 on 2026-11-21): roadmap Plan 14C's first UI task (D24c), since its ghost preview is the first later feature drawn on that surface; Plan 16's row 16-1 describes it. Extract the warp fetch, the encounter fetch and the lens overlays as hooks.
- **U8, no `AbortController`:** not planned. The hooks already drop late results and the server is local.
- **P1-P5, Plan 3 and Plan 5 overlap the roadmap:** resolved by roadmap D22 (amended by D27 for Plan 3's tileset work). The moved task texts stay in those plans, labelled as moved, as requirements for the receiving roadmap plans.

## Block-editor carry-over accepted by the 2026-11-20 triage, not in Plan H

- **Accepted by the triage, not here:** F4 (GBC placement groups may place run-time reserved tiles), Task 7 N1, N3, N4; Task 8 M4, M6; Task 11a m2a, m2c; the 14b tool enabled while unwired.
