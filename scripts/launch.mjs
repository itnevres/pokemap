#!/usr/bin/env node
// One-click launcher (Plan 4 row 1b, D32). Double-click `PokeMap.cmd` at the repo root, which runs this.
//   1. Node too old -> say so, stop.
//   2. PokeMap already answering on the port -> only open the browser.
//   3. `node_modules` missing -> `npm ci`.   UI build missing or older than its sources -> build it.
//   4. Start the hub (serves the built UI), wait until it answers, open the browser.
// Closing this window stops the hub. Never runs git, never writes into a game project.
// Flags (for testing and odd setups): `--port <n>` (1-65535, default 5174), `--no-open` (do not open a browser),
// `--check` (start, wait until it answers, report, stop: a self-test), and `--gbc` / a project path, passed
// straight to the hub.
//
// Exits by setting `process.exitCode` and letting the event loop drain, never `process.exit()`: on Windows,
// `process.exit()` right after a `fetch` aborts with a libuv assertion ("UV_HANDLE_CLOSING").
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 5174;
const passThrough = args.filter((a, i) => !["--no-open", "--check", "--port"].includes(a) && !(portAt >= 0 && i === portAt + 1));
const url = `http://127.0.0.1:${port}/`;
const isWin = process.platform === "win32";

const say = (m) => process.stdout.write(`${m}\n`);

/** A plain-words stop: caught once at the bottom, printed, exit code 1. */
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };

/** Newest modification time of every file under `path` (0 when it does not exist); skips node_modules and dist. */
function newestMtime(path) {
  try {
    return newestMtimeUnsafe(path);
  } catch {
    return Infinity; // unreadable: treat the build as stale rather than show a stack trace
  }
}
function newestMtimeUnsafe(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name === "dist") continue;
    newest = Math.max(newest, newestMtimeUnsafe(join(path, name)));
  }
  return newest;
}

/** One GET, headers and body, under one timer; always closes its connection so nothing keeps the process alive. */
async function get(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`${url}${path}`, { signal: ctl.signal, headers: { connection: "close" } });
    const text = await r.text();
    return { ok: r.ok, type: r.headers.get("content-type") ?? "", text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "ui": a PokeMap hub serving the app page. "no-ui": a hub without the page. "other": something else answered.
 * "down": nothing answered. `loading` is true while a recent project exists but none is open yet.
 */
async function hubStatus() {
  let hub;
  try {
    hub = await get("api/hub");
  } catch {
    return { state: "down" }; // nothing answered
  }
  try {
    if (!hub.ok) return { state: "other" };
    const j = JSON.parse(hub.text);
    if (!j || typeof j !== "object" || !("recent" in j)) return { state: "other" };
    const page = await get("");
    const loading = j.current == null && Array.isArray(j.recent) && j.recent.length > 0;
    return { state: page.ok && page.type.startsWith("text/html") ? "ui" : "no-ui", loading };
  } catch {
    return { state: "other" }; // something answered, but not like PokeMap
  }
}

function openBrowser() {
  if (flag("--no-open") || flag("--check")) return say(`PokeMap is at ${url}`);
  const [cmd, cmdArgs] = isWin ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: "ignore", windowsHide: true }).on("error", () => say(`Open ${url} in your browser.`)).unref();
  } catch {
    say(`Open ${url} in your browser.`);
  }
}

function run(label, command) {
  say(`${label} ...`);
  // `npm` is `npm.cmd` on Windows, which needs a shell; one command string (no args array) keeps it simple.
  const r = spawnSync(command, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) fail(`"${label}" failed (see the messages above). Fix that, then double-click PokeMap again.`);
}

async function main() {
  // 1. Node version
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) {
    fail(`This computer has Node.js ${process.versions.node}. PokeMap needs 20.19 or newer (or 22.12+).\nInstall the current LTS from https://nodejs.org and double-click PokeMap again.`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("--port needs a whole number from 1 to 65535.");

  // 2. already running
  const before = (await hubStatus()).state;
  if (before === "ui") {
    say("PokeMap is already running. Opening it.");
    return openBrowser();
  }
  if (before === "no-ui") fail(`A PokeMap server is already running on port ${port}, but it is not serving the app page (it was started for development). Close it, then double-click PokeMap again.`);
  if (before === "other") fail(`Something else is using port ${port}. Close that program, then double-click PokeMap again.`);

  // 3. install and build
  if (!existsSync(join(root, "node_modules"))) run("Installing PokeMap's parts (first run only, a few minutes)", "npm ci");
  const distIndex = join(root, "packages", "ui", "dist", "index.html");
  const sourcesNewest = Math.max(
    newestMtime(join(root, "packages", "ui", "src")),
    newestMtime(join(root, "packages", "ui", "index.html")),
    newestMtime(join(root, "packages", "ui", "package.json")),
    newestMtime(join(root, "packages", "ui", "vite.config.ts")),
    newestMtime(join(root, "packages", "core", "src")),
    newestMtime(join(root, "package-lock.json")),
  );
  if (!existsSync(distIndex) || statSync(distIndex).mtimeMs < sourcesNewest) {
    run("Building the app page", "npm run build --workspace=@pokemap/ui");
  }

  // 4. start the hub, wait, open
  const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsx)) fail("PokeMap's parts look incomplete (tsx is missing). Delete the node_modules folder and double-click PokeMap again.");
  const hub = spawn(process.execPath, [tsx, join("packages", "server", "src", "serve.ts"), "--port", String(port), ...passThrough], {
    cwd: root,
    stdio: "inherit",
  });
  let hubExited = false;
  hub.on("exit", (code) => {
    hubExited = true;
    say(`\nPokeMap stopped${code ? ` (code ${code})` : ""}. You can close this window.`);
    process.exitCode = process.exitCode || code || 0;
  });
  const stop = () => { if (!hubExited) hub.kill(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", stop);

  const deadline = Date.now() + 90_000;
  let status = "down";
  while (Date.now() < deadline && !hubExited) {
    const h = await hubStatus();
    status = h.state;
    if (status !== "down") break;
    await new Promise((r) => setTimeout(r, 400));
  }
  // The hub listens first and then reopens the most recent project; give that a few seconds so the browser
  // lands on the project, not the picker. A project that cannot be reopened costs this wait, then the picker shows.
  for (let i = 0; status === "ui" && i < 50 && !hubExited; i++) {
    if (!(await hubStatus()).loading) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (status !== "ui") {
    stop();
    fail(
      hubExited ? "PokeMap stopped before it was ready. If the messages above say the port is in use, close the program that uses it (or wait a moment if PokeMap was just started) and double-click PokeMap again."
        : status === "down" ? "PokeMap did not start within 90 seconds. See the messages above."
        : "PokeMap started but is not serving the app page.",
    );
  }
  say(`\nPokeMap is running at ${url}`);
  if (flag("--check")) {
    say("--check: PokeMap answered, stopping.");
    return stop();
  }
  say("Leave this window open while you work. Close it to stop PokeMap.");
  openBrowser();
}

try {
  await main();
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  process.stderr.write(`\nPokeMap could not start.\n${e.message}\n`);
  process.exitCode = 1;
}
