#!/usr/bin/env node
// Dev entry point. `createHub` is a library function so tests can bind an
// ephemeral port; this is the thing you run by hand to look at the UI.
//
// Plan 6c A1: this used to call `createServer` directly for one fixed
// project (`pokemap.config.json`'s own `projectPath`). It now starts the
// hub -- one listener that can open, close and swap between ANY GBA/GBC
// decomp root over its lifetime, not just the one this repo's own config
// happens to name. Behaviour change worth naming: a bare `pokemap` (no
// args, no `--gbc`) no longer opens `cfg.projectPath` -- it reopens whatever
// was opened most recently (`recent.json`), or nothing at all on a first
// run, and the hub's own picker (a later task) is how you open a project
// from there. `.claude/launch.json`'s `server` entry is already this file
// with no args, so it now starts the hub; `server-gbc` (`--gbc`) is
// unaffected.
import { readFileSync } from "node:fs";
import { createHub } from "./hub.js";
import { probeEngineFamily } from "@pokemap/core/src/family.js";
import { readRecent, recentHome } from "./recent.js";

async function main(): Promise<void> {
  // `pokemap.config.json` is read ONLY for `--gbc` below -- a hub user may
  // never have one (this file no longer needs a `projectPath` to start at
  // all), so reading it unconditionally the way the old, single-project
  // version of this file did would refuse to start for no reason.
  let openPath: string | undefined;

  if (process.argv.includes("--gbc")) {
    // Wins unconditionally over any positional root also given (e.g.
    // `serve.ts --gbc /some/path`): the positional path is never read in
    // that case, not even to warn about it. Not a footgun this file guards
    // against, just worth knowing if you're used to typing a positional
    // path and prepend `--gbc` without removing it.
    //
    // `--gbc` selects the config's GBC block explicitly, mirroring the CLI's
    // own `--project`-or-config resolution but for the one GBC root this dev
    // server is pointed at. `cli/src/context.ts`'s own `resolveRoot`
    // documents `gbc.projectPath` as test-only config, "never a CLI
    // fallback" -- that's about the CLI's command-line UX (a real CLI
    // invocation always takes `--project` explicitly for GBC). This file is
    // different: it has no `--project`-equivalent flag of its own beyond the
    // plain positional root below, and `pokemap.config.json`'s
    // `gbc.projectPath` is exactly the already-configured Crystal project
    // every GBC dev session against this repo uses. Reading it here is a
    // deliberate dev-server convenience, not a CLI fallback, and this file is
    // the one sanctioned non-test reader of it.
    const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { gbc?: { projectPath: string } };
    if (!cfg.gbc?.projectPath) {
      // A named refusal, not a thrown stack trace -- this is a config
      // mistake a person will hit directly, not a bug to debug.
      process.stderr.write('pokemap.config.json has no "gbc.projectPath"\n');
      process.exitCode = 1;
      return;
    }
    openPath = cfg.gbc.projectPath;
  } else {
    // The first argv entry after the script that isn't a flag -- `argv[0]`
    // is the node binary, `argv[1]` this script, so a positional root can
    // start at `argv[2]`. Running `serve.ts --gbc` makes `argv[2]` the flag
    // itself, not a root, but the branch above already claims that case --
    // this `else` only ever sees a plain positional invocation or none.
    openPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  }

  // `open` given (either branch above) -> createHub opens it before ever
  // listening, and a bad root throws straight out of this call (the same
  // refusal a positional-root invocation always gave). No args at all ->
  // start with nothing open; the block below then tries the most recent
  // project as a convenience, tolerating failure.
  const hub = await createHub({ port: 5174, open: openPath });

  if (!openPath) {
    const mostRecent = readRecent(recentHome())[0];
    const family = mostRecent ? probeEngineFamily(mostRecent.path) : null;
    if (mostRecent && (family === "gba" || family === "gbc")) {
      // Goes through the hub's own already-listening HTTP endpoint, exactly
      // as a browser-based picker would -- `Hub` deliberately has no
      // second, in-process "open" method of its own to keep in sync with
      // this one. A failure here (root moved, deleted, or now ambiguous
      // since it was last opened) is reported and left at "no project
      // open," never a crash: the hub is already listening by this point,
      // and the picker (a later task) is how a person recovers from here.
      try {
        const r = await fetch(`http://127.0.0.1:${hub.port}/api/hub/open`, {
          method: "POST",
          body: JSON.stringify({ path: mostRecent.path }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as { error?: string };
          process.stderr.write(`pokemap hub: could not reopen ${mostRecent.path}: ${body.error ?? r.status}\n`);
        }
      } catch (e) {
        process.stderr.write(`pokemap hub: could not reopen ${mostRecent.path}: ${(e as Error).message}\n`);
      }
    }
  }

  const current = hub.current();
  const status = current ? `${current.family} ${current.info.root}` : "no project open";
  process.stdout.write(`pokemap hub on http://127.0.0.1:${hub.port} (${status})\n`);
}

// QR-F3: an uncaught rejection from main() (e.g. createHub({ open }) throwing
// for a bad positional root) would otherwise be an unhandled top-level-await
// rejection -- Node prints a raw stack trace and exits non-zero, unlike the
// named, single-line refusal this file already gives the --gbc-missing-
// config case above. Same shape here, for every other startup failure.
try {
  await main();
} catch (e) {
  process.stderr.write(`pokemap hub: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
