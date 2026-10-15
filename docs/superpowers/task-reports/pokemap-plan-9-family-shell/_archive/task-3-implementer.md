# Task 3 implementer report (Codex gpt-5.6-terra; orchestrator ported + committed 31831c7)
Implemented Task 3; no commit made.

Changed:
- `packages/ui/src/gba/adapter.tsx` — new `useGbaRuntime` and `gbaAdapter`
- `packages/ui/test/shell/adapter.test.ts` — appended GBA adapter contract test

Verification:
- `npm.cmd run typecheck` — passed cleanly.
- Targeted Vitest could not start: PowerShell blocks `npx.ps1`; `npx.cmd vitest …` then failed loading `vitest.config.ts` because the sandbox denied an ancestor-directory read. No tests were collected or run.

Copied comments from `App.tsx`:
- lines 44–48
- lines 52–64
- lines 67–69
- lines 185–193
- lines 345–348

Discrepancies with GBA `App.tsx` props/guards/wiring: none. No additional type export was needed.
## Orchestrator gate in p9
No <copy placeholders left. Targeted adapter.test.ts: 4 pass. Full: 2719 pass / 0 fail / 173 files. Typecheck clean. Build ok.
