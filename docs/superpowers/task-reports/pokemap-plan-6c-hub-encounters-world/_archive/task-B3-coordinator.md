# Task B3 coordinator record

**Closed 2026-10-01.** Final code commit `c934eeb` (report `42f70b5`).

## Flow
- Spec `task-B3-spec.md` (`e9457e0`). Sonnet implementer: `704f6ad` EncounterBorder, `755d4ab` GBA
  wiring + `isGbaEncountersPayload` (GBA encounter fetch now guarded and counted, with the same
  `Encounter data unavailable for N map(s)` alert GBC has). A rate limit cut the agent off here; the
  tree was clean, and it was resumed via SendMessage. Then `79fd8bd` GBC wiring, `ef7e73a` deleted
  both gutters, their tests and CSS, plus DESIGN.md. Gate 1,873.
- Opus spec review ❌ (`9e5b7e8`): 1 blocking. **SR-F1:** the GBC LOD 7/8 pin was lost with
  `GbcEncounterGutter.test.tsx` (mutant `lodZoom={4}` survived every GbcWorldCanvas test); GBA's
  analogue (`lodZoom={8}`) survived too. 4 minor, 3 info. The old→new table was otherwise verified row
  by row. Sonnet quality review approved, 6 Minor + 4 Nit (`1e34c20`).
- One fix round, same implementer: `316ca1f` (SR-F1/F5/F4, QR-5: canvas LOD + band pins, positive
  evidence before negative fetch-count checks), `3c6b2ef` (QR-1 `+N` is a focusable button whose tooltip
  lists the hidden species; QR-2 lines built on show; QR-6 anchor-math test; QR-7 dim the img, not the
  focus ring; QR-8 dimmed `aria-label` "…, not encountered at <time>"; QR-9 `GbcTimeOfDay`), `c934eeb`
  (SR-F2/F3, QR-3/4/10: comments, DESIGN.md, B2 doc says `neighbours` may include the map itself).
  Gate 1,880 pass / 0 fail, typecheck and build clean.
- Mid-round slip (implementer): a mutant-restore `git checkout` wiped uncommitted `EncounterBorder.tsx`
  edits once; it re-applied them. The re-run below shows the committed code carries every fix.
- Named existing-test edits (U1), verified by the spec review: `GbcWorldCanvas.test.tsx` "the Encounters
  toggle shows a species chip…" (text chip → sprite button + img src) and the `makeFetchMock` helper in
  `WorldCanvas.test.tsx` (gained an `/api/encounters/` route; the GBA fetch is now guarded, so an
  unanswered fetch would raise the new alert in every test). Both deleted gutter test files are mapped
  row by row in `task-B3-implementer.md`.
- Coordinator decisions: keep the map itself in `neighbours` (equivalent: a band lies strictly outside
  its rect); test-file comment staleness (QR-10's test files) left alone under U1.

## Mutation re-run on `c934eeb` (coordinator)
| ID | Result | Red test (first) |
|---|---|---|
| GBA side always `left` | killed | WorldCanvas: puts the border on the side pickBorderSide gives… → top |
| GBC side always `top` | killed | GbcWorldCanvas: MapB (left blocked by MapA) -> top, MapA -> left |
| dimming inverted | killed | 5 tests incl. tooltipLines 'Not encountered…', ZUBAT dimmed at morn |
| tooltip drops time | killed | tooltipLines POLIWAG on Route30 |
| LOD `<=` | killed | EncounterBorder LOD lodZoom-1 vs lodZoom |
| M10 GBC `lodZoom={4}` | killed | GbcWorldCanvas wheeling out from the fit zoom… |
| M15 GBC band = gba | killed | same (band thickness) |
| M20 GBA `lodZoom={8}` | killed | WorldCanvas wheeling in from zoom 1… sprites from 4 |
| GBA fetch placeholder off | killed | WorldCanvas fetches … once per visible map |
| GBC fetch placeholder off | killed | GbcWorldCanvas GBA-shaped payload … not retried |
| tooltip anchor drops container offset | killed | EncounterBorder tooltip anchors at the sprite's top-centre… |
| `+N` aria-label dropped | killed | EncounterBorder capacity: '+N' chip is a focusable button… |
| GBA failed count not incremented | killed | WorldCanvas GBC-shaped payload shows 'Encounter data unavailable for 1 map' |
Requested 13, reported 13; tree byte-identical afterwards.
