# Launch PokeMap

## Prerequisites

- Node.js 20.19+ or 22.12+, and npm installed, to run the app. The UI's Vite 8.3.8 and `@vitejs/plugin-react` 6.1.1 declare `^20.19.0 || >=22.12.0`. Running the tests (`npm test`) needs Node 22.12+ (22.x, 24.x or 26+), because Vitest 5.1.1 declares `^22.12.0 || ^24.0.0 || >=26.0.0`.
- From the repository root, install dependencies with `npm ci`.

## One-click launch (Windows)

Double-click `PokeMap.cmd` in the repository root. A console window opens; leave it open while you work, and close it to stop PokeMap. The first run installs dependencies, which takes a few minutes. The launcher (`scripts/launch.mjs`):

1. Needs Node.js (see Prerequisites). If Node is missing or too old, it says so in plain words and stops.
2. If PokeMap is already running on port 5174, only opens the browser.
3. Runs `npm ci` if `node_modules` is missing.
4. Builds the app page (`packages/ui/dist`) if it is missing or older than the UI sources, `packages/core/src` or `package-lock.json`.
5. Starts the hub with `packages/server/src/serve.ts`, which serves the built page and the API on one port. It waits until the hub answers (and, when a recent project exists, until it has reopened, up to about 20 seconds), then opens <http://127.0.0.1:5174/>. The hub reopens the most recently used project.

It never runs git and never writes into a game project. For a desktop shortcut, right-click `PokeMap.cmd`, then Send to, then Desktop (create shortcut).

Launcher flags (for testing and unusual setups): `--port <n>` (1-65535, default 5174), `--no-open` (do not open a browser), `--check` (start, wait until the hub answers, then stop), plus `--gbc` or a project path, passed to the hub. Run it from a terminal with `node scripts/launch.mjs`.

## Hub flags (`serve.ts`)

`serve.ts` serves `packages/ui/dist` itself whenever `packages/ui/dist/index.html` exists, so with a built page the app is also at <http://127.0.0.1:5174/>. `--no-ui` turns that off; `--port <n>` picks the port (0-65535, write it with a space, not `--port=`; `0` lets the system choose and the real port is printed). During development a stale build in `dist` can show up on 5174 next to the live Vite page on 5173: run `npm run build --workspace=@pokemap/ui` to refresh it, or pass `--no-ui`.

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

## Git Bash shortcut on Windows (development servers)

From Git Bash at the repository root, run:

```bash
bash launch.sh
```

It starts the API and UI, then opens the browser. It reuses an API when `GET /api/groups` succeeds. Ctrl+C stops only processes it started; a reused API stays running. If the launcher times out waiting for `/api/groups` (for example, the hub has no project loaded), use the manual workflow above. To check whether the API is listening, request `http://127.0.0.1:5174/api/hub`.

The `.claude/launch.json` profiles `ui`, `server`, and `server-gbc` provide the same individual UI and API commands for browser tooling.

## Keeping this guide current

Any change to prerequisites, scripts, the server entry point, ports or proxy, project selection/config behavior, or launch tooling must update this guide in the same change. Keep the launch pointers in `AGENTS.md`, `CLAUDE.md`, and `docs/superpowers/RESUME.md` synchronized.
