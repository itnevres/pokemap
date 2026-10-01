# Task B2 coordinator record

**Closed 2026-09-30.** Final code commit `41f7f1d` (report `f7be957`).

## Flow
- Spec `task-B2-spec.md` (`27bf525`). Sonnet implementer: `91a4558`, `c883f57`; gate 1,849.
- Opus spec review ✅ (`e3c313e`): 13/13 non-equivalent mutants killed of 18 run; SR-F1 (left/top band
  only asserted on a square map; M6d/M6e survived), SR-F2 (spec text), SR-F3 (equivalent mutant).
  Sonnet quality review approved (4 Minor, 3 Nit).
- Fix round, same implementer: `7557cc5` (SR-F1: all four `bandRect`s on a 5×6 rect), `41f7f1d`
  (QR-3 `gbaDirToCompass` exported + tested for B4; QR-2 `readonly Rect[]`; QR-1/QR-7 doc lines).
  Gate 1,857 pass / 0 fail, typecheck and build clean.
- Not done: QR-4 (UI test importing `core/test` corpus helpers, acceptable; revisit if more UI corpus
  tests appear), QR-5/6 nits.

## Spec corrections (the coordinator's own spec was wrong twice)
- "`>=` instead of `>`" is an **equivalent** mutant: `overlapArea` multiplies `max(0, w)·max(0, h)`, so
  the comparison never decides anything. The real closed-interval mutant (touch counts as area) is
  what the tests must kill, and does.
- A closed "touching" rule does **not** flip NewBarkTown's side: all four sides become blocked, but the
  least-overlap fallback still picks `top` (L18/T0/R18/B0 by area). The closed rule is pinned by the
  unit corner and gap = band tests and by the corpus overlap numbers, not by NewBarkTown's side.
  (Route30 would flip to `right` under the area-closed mutant.)

## Mutation re-run on `41f7f1d` (coordinator)
| ID | Result | Red test |
|---|---|---|
| M6d left band `height: w` | killed | bandRect all four sides on a non-square rect |
| M6e top band `width: h` | killed | same |
| G1 `gbaDirToCompass` up→south | killed | gbaDirToCompass up -> north |
| S1 side order top first | killed | 9 tests incl. constants, U4 examples |
| C1 closed overlap (touch = area 1) | killed | 9 tests incl. overlapArea touching is 0, all-blocked fixture |
Requested 5, reported 5; tree byte-identical afterwards.
