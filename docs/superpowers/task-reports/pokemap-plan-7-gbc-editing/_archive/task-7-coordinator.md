# Task 7 coordinator record (the G5 write gate)

- Final code commit: `572c9d2`. Report commit: `1c64e15`.
- pret/pokecrystal (`3bc8daa`) is now a `gbc.referenceProjects` corpus root. The cloud hook fetches it pinned (`2428ac6`).
- Reviews:
  - spec review (Opus): ISSUES 0/1/3;
  - quality review (Sonnet): CHANGES_REQUESTED 1/6/9.

  Both caught that **the implementer's first report claimed a hook `PINNED` entry that didn't exist**: the pret half of the gate would have skipped silently in the cloud. That's fixed, and the gate now fails if any configured root is absent.
- **Product fix landed in this task (coordinator decision):** const pairing is keyed on whether the `object_const_def` marker is present (`61a8e05`). Before it, deleting a map's sole object left an empty const block, and the map lost its const pairing for good.
  - Shared helper `objectConstDefLine` in `load/events.ts`, used by both `objectConstPlan` and the guard's desync rule.
  - Named test edits: events tests 10 and 11d, and the lineIdentity paired rule.
  - Effect: 2 real maps with an empty marker and 0 objects (CeruleanCave2F; measure for any others) now get a const when an object is added.
- The coordinator read the F3 diff: minimal and correct (an empty block anchors the new const right after the marker).
- **Accepted (spec reviewer's product verdict):** a re-added event line is canonical. Comments and odd spacing aren't kept, because add builds a fresh line. Undo restores text by snapshot, so comments survive undo/redo. Gate skips for non-canonical lines are pinned by reason.

## Gate coverage (pinned, per root)

| | PerfPlus | pret `3bc8daa` |
|---|---|---|
| maps | 391 | 388 |
| layouts / writable | 257 / 255 | 254 / 254 |
| non-writable (refusal checked) | CeruleanCave2F, CeruleanCaveB1 | none |
| binary paint→commit→restore round trips | 255 | 254 |
| delete-last + re-add (warp/coord/bg/object) | 379/44/223/286 | 379/44/223/287 |
| plus moves (all 4 kinds) and add-then-delete on empty sections | | |
| whole-tree byte compare of the copy vs the real root | 0 diffs, no `.pokemap` | same |

## Coordinator mutation re-run on `1c64e15` (code = `572c9d2`)

| ID | Mutation | Result | Red |
|---|---|---|---|
| F3 | pairing back to `names.length === 0` | red | events 10, 11d, 11f; lineIdentity |
| F3g | guard back to `objectConsts.length > 0` | red | guards "marker-present" |
| F3gate | the same F3 mutation, run against the gate (subject) | red | B4, B5, B6 |

PerfPlus and pret porcelains were empty afterwards.

## Full gate = Plan 7 merge gate (HEAD `1c64e15`, 2026-10-08)

- `npm test`: **2,432 pass / 2 fail** (145 files, 71.7 s). The 2 failures are the known local-state `world.test.ts` pair.
- Typecheck is clean and the UI build passes.
- External state is unchanged:
  - GBA subject: 7 porcelain lines, `world.json` `b285bbf…`, `dungeons.json` `f73f9b7…`;
  - PerfPlus and pret: clean, no `.pokemap`.

Task 5b (in-context editing) still has to land and pass this gate again before close-out.
