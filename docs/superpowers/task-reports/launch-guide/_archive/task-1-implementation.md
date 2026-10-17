# Launch guide task report

Tier: Low. Documentation-only, fully specified, with no parsing, concurrency, or code behavior changes.

Delegate routing reason: This was a fully specified, low-risk documentation task across four files, so it was dispatched to the explicitly selected gpt-6-luna implementer per cost discipline.

Created root `LAUNCH.md` with prerequisites, manual PowerShell launch, explicit and GBC project selection, the Git Bash shortcut, troubleshooting, and a maintenance rule. Added short pointers near the top of `AGENTS.md` and `CLAUDE.md`, and under `## Running it` in `docs/superpowers/RESUME.md`.

Checked the guide against `launch.sh`, root and UI package manifests, `packages/ui/vite.config.ts`, `packages/server/src/serve.ts`, `packages/server/src/hub.ts`, and `.claude/launch.json`. Confirmed the RESUME relative link resolves and the guide captures the relevant commands, proxy target, GBC precedence, and Vite port fallback. The readiness URL is `GET /api/hub` (defined in `hub.ts`). The UI's installed Vite 8.2.2 and `@vitejs/plugin-react` 6.1.1 both declare Node `^20.19.0 || >=22.12.0`; that minimum is documented.

Parent verification: `npm test` passed, 2,837 tests in 181 files, zero failures; `npm run typecheck` and `npm run build --workspace=@pokemap/ui` passed. Documentation links and final diff checked. No UI behavior changed; no live UI check or separate reviewer warranted. Parent corrected the readiness endpoint and checked the UI-local dependency versions independently. Final evidence recorded inline because this is a tiny report-only edit.
