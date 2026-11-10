VERDICT: ALL ADDRESSED

- **ADDRESSED — block comments join tokens:** `packages/core/src/addEvent/names.ts:49` inserts whitespace. In-memory probe now extracts `FLAG_` from `#define FLAG_/**/X 1`.
- **ADDRESSED — escaped backslashes keep strings open:** `packages/core/src/addEvent/names.ts:60` and `:119` consume escaped pairs in GBA/GBC. The GBA reproducer now preserves `FLAG_REAL`.

No NEW Critical/Important breakage found in `91dd5ea..0f616d5`.

Read-only probes passed; no Vitest run. Conductor-reported evidence: 288/288 focused tests, clean tsc.