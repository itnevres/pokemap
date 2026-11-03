# Plan 14 ledger (14a Add Event, 14b Block editor)

Branch `plan-14-gbc-editing-gaps` from master `7c68fc1` (local only).

## Baseline

- Gate at `7c68fc1` (2026-11-02): 3,934 pass / 0 fail / 236 files; typecheck pass, UI build pass; subjects unchanged
  (GBA `26a2e3d1e` + the user's 9 porcelain lines; PerfPlus `81ededbe3` clean; pret `3bc8daa41` clean).

## Decisions (2026-11-02 interview)

- Roadmap D19 (Plan 14 = 14a + 14b, both families), D20 (block editor replaces collision-only editor); new-trainers
  future-plan note. 14a spec rulings A1-A8, approved, `1c01653`.
- 14b accepted playback (spec pending): Polished-Map Edit Block popup over the map, tile picker + rendered block, GBC
  4x4 + collision dropdowns, GBA 2x2x2 layers + palette/flip + behavior/layer, usage warning, OK = everywhere, Save as
  new block appends an id, pending + undo until Save. Reference: `refs/polished-map` (`8b9bdc2`, cloned 2026-11-02).

## Reviews

- 14a spec: Codex `gpt-6-astra` builder check + review (12 Important folded in), user approved.
- 14a plan: Codex `gpt-6-astra` round 1 (10 Important, 1 Minor), round 2 (1 new Important + partials), round 3 (4 partials), round 4 APPROVED.

## Tasks (14a)

| # | Tier | State | Hops | Commit |
|---|---|---|---|---|
| 1 | High | pending | | |
| 2 | High | pending | | |
| 3 | High | pending | | |
| 4 | High | pending | | |
| 5 | High | pending | | |
| 6 | High | pending | | |
| 7 | High | pending | | |
| 8 | High | pending | | |
| 9 | High | pending | | |
| 10 | High | pending | | |

## Offload log

- Code sweeps: Gemini 503 x3 (high demand) → Nemotron 3.5 Super (ask.py) each time, answers spot-checked.
