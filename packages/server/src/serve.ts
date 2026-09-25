#!/usr/bin/env node
// Dev entry point. `createServer` is a library function so tests can bind an
// ephemeral port; this is the thing you run by hand to look at the UI.
import { readFileSync } from "node:fs";
import { createServer } from "./index.js";

async function main(): Promise<void> {
  const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
    projectPath: string;
    gbc?: { projectPath: string };
  };

  let root: string;
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
    if (!cfg.gbc?.projectPath) {
      // A named refusal, not a thrown stack trace -- this is a config
      // mistake a person will hit directly, not a bug to debug.
      process.stderr.write('pokemap.config.json has no "gbc.projectPath"\n');
      process.exitCode = 1;
      return;
    }
    root = cfg.gbc.projectPath;
  } else {
    // The first argv entry after the script that isn't a flag -- `argv[0]`
    // is the node binary, `argv[1]` this script, so a positional root can
    // start at `argv[2]`. Not simply `argv[2]`: running `serve.ts --gbc`
    // makes `argv[2]` the flag itself, not a root, and the branch above
    // already claims that case -- this `else` only ever sees a plain
    // positional invocation or none at all.
    root = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? cfg.projectPath;
  }

  const s = await createServer({ projectPath: root, port: 5174 });
  process.stdout.write(`pokemap server (${s.family}) on http://127.0.0.1:${s.port} for ${root}\n`);
}

await main();
