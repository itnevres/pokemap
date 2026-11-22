import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(HERE, "../../cli/src/index.ts");
const REPO_ROOT = join(HERE, "../../..");

export interface CliResult { status: number; stdout: string; stderr: string }

/**
 * Runs the real CLI (`node --import tsx packages/cli/src/index.ts`) so every
 * tool returns exactly what the CLI prints, refusal text included. `node
 * --import tsx` rather than `npx tsx`: Windows cannot spawn the npx .cmd shim
 * without a shell. cwd is the repo root so pokemap.config.json's fallback
 * resolves when no project is given.
 */
export function runCli(project: string | undefined, args: string[]): Promise<CliResult> {
  const full = [...(project ? ["--project", project] : []), ...args];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...full], { cwd: REPO_ROOT });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (e) => resolve({ status: 1, stdout, stderr: `${stderr}${e.message}` }));
    child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}
