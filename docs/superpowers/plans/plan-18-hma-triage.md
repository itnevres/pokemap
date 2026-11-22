# Plan 18: HexManiacAdvance triage (#7)

Rate each HexManiacAdvance feature listed in issue #7 and split the keepers into issues. For each feature: fit with PokeMap's decomp-first model (HMA edits ROMs), engine coverage, cost; keepers become issues mapped to the plan that owns them or to adapter features. No implementation.

## Status

Open. Not started. Runs early: before the Plan 19 (trainers), Plan 3 and Plan 5 section 1 specs (D24d).

## Depends on

- Nothing. A short docs-only session, any time (D18).
- Risk: low.

## Binding decisions

- D16, D18, D24d (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **The feature list is not in the repository.** It is the body of issue #7: 21 checklist items in six groups (data, map, text, image and code editing, utilities). The session reads it with `gh issue view 7 --repo itnevres/pokemap`.
2. **Many items already have an owner.** Editing maps, events and warps is built, and connections are Plan 14C; the town map is Plans 15a and 15b; trainers are Plan 19; event scripts shown as controls are the Sign tool, Add Event, and Plan 5 section 1; jumping between related maps is built (the warp destination popup). The table names the plan that owns each, and "already done" is a valid rating.
3. **HexManiacAdvance edits GBA ROMs.** Every keeper needs a line on what it means for Crystal, because the goal is one feature in both families.
4. **The result has two homes and neither is a new file.** The rating table goes into this file, section "Rating table" (`CLAUDE.md`: no new decision documents); the keepers become GitHub issues, and creating issues is the user's go-ahead on the finished list.

## Subtasks

- 18-1: read the issue, rate each item (fit with the decomp-first model, both families, cost, owning plan), and write the table into this file. Docs only, Low, one session.
- 18-2: the user reviews the table.
- 18-3: after the go-ahead, create one issue per keeper and add a pointer in the owning plan.

## Acceptance

- All 21 items have a row (check for 18-1).

## Rating table

Written by subtask 18-1.
