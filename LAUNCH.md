# Launch PokeMap

## Prerequisites

- Node.js 20.19.x or later in the 20.x line, or 22.12+, and npm installed. The UI's Vite 8.2.2 and `@vitejs/plugin-react` 6.1.1 both declare `^20.19.0 || >=22.12.0`.
- From the repository root, install dependencies with `npm ci`.

## Manual launch (PowerShell)

```powershell
cd 'C:\Programming Projects\PokeMap'
npx tsx packages/server/src/serve.ts
```

Keep that terminal open. In a second PowerShell terminal:

```powershell
cd 'C:\Programming Projects\PokeMap'
npm run dev --workspace=@pokemap/ui
```

Open <http://localhost:5173>. The UI's `/api` requests are proxied to the API at `127.0.0.1:5174`. Vite can choose another port if 5173 is occupied; use the URL printed by Vite. Stop each manually started server with Ctrl+C in its terminal. Do not kill unrelated processes occupying a port.

With no arguments, the API reopens the most recently used project, if available; otherwise it starts with no project and the UI shows the project picker. This normal launch does not read `pokemap.config.json`'s `projectPath`.

To open an explicit decomp root (the engine family is detected automatically), start the API with:

```powershell
npx tsx packages/server/src/serve.ts "C:/path/to/decomp"
```

For the configured GBC project, use `--gbc`:

```powershell
npx tsx packages/server/src/serve.ts --gbc
```

This reads `gbc.projectPath` from `pokemap.config.json`. When `--gbc` is present, it takes precedence over a positional path.

## Git Bash shortcut on Windows

From Git Bash at the repository root, run:

```bash
bash launch.sh
```

It starts the API and UI, then opens the browser. It reuses an API when `GET /api/groups` succeeds. Ctrl+C stops only processes it started; a reused API stays running. If the launcher times out waiting for `/api/groups` (for example, the hub has no project loaded), use the manual workflow above. To check whether the API is listening, request `http://127.0.0.1:5174/api/hub`.

The `.claude/launch.json` profiles `ui`, `server`, and `server-gbc` provide the same individual UI and API commands for browser tooling.

## Keeping this guide current

Any change to prerequisites, scripts, the server entry point, ports or proxy, project selection/config behavior, or launch tooling must update this guide in the same change. Keep the launch pointers in `AGENTS.md`, `CLAUDE.md`, and `docs/superpowers/RESUME.md` synchronized.
