#!/usr/bin/env node
// One-click launcher (Plan 4 row 1b, D32). Double-click `PokeMap.cmd` at the repo root, which runs this.
//   1. Node too old -> say so, stop.
//   2. PokeMap already answering on the port -> only open the browser.
//   3. `node_modules` missing -> `npm ci`.   UI build missing or older than its sources -> build it.
//   4. Start the hub (serves the built UI), wait until it answers, open the browser.
// Closing this window stops the hub. Never runs git, never writes into a game project.
// Flags (for testing and odd setups): `--port <n>` (default 5174), `--no-open` (do not open a browser),
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
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name === "dist") continue;
    newest = Math.max(newest, newestMtime(join(path, name)));
  }
  return newest;
}

/** One GET that always closes its connection and its timer, so nothing keeps the process alive afterwards. */
async function get(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    return await fetch(`${url}${path}`, { signal: ctl.signal, headers: { connection: "close" } });
  } finally {
    clearTimeout(timer);
  }
}

/** "ui": a PokeMap hub serving the app page. "no-ui": a hub without the page. "other": something else. "down": nothing. */
async function hubStatus() {
  let r;
  try {
    r = await get("api/hub");
  } catch {
    return "down"; // nothing answered
  }
  try {
    if (!r.ok) return "other";
    const j = await r.json();
    if (!j || typeof j !== "object" || !("recent" in j)) return "other";
    const page = await get("");
    await page.arrayBuffer();
    return page.ok && (page.headers.get("content-type") ?? "").startsWith("text/html") ? "ui" : "no-ui";
  } catch {
    return "other"; // something answered, but not like PokeMap
  }
}

function openBrowser() {
  if (flag("--no-open") || flag("--check")) return say(`PokeMap is at ${url}`);
  const [cmd, cmdArgs] = isWin ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).on("error", () => say(`Open ${url} in your browser.`)).unref();
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
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail("--port needs a whole number from 0 to 65535.");

  // 2. already running
  const before = await hubStatus();
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
    status = await hubStatus();
    if (status !== "down") break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (status !== "ui") {
    stop();
    fail(
      hubExited ? "PokeMap stopped before it was ready. See the messages above."
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
