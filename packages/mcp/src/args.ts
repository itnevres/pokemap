import { parseArgs } from "node:util";

export interface McpArgs { project?: string; allowWrites: boolean }

/** Parses `[--project <path> | --project=<path>] [--allow-writes]`; throws on a missing value or an unknown option. */
export function parseMcpArgs(argv: string[]): McpArgs {
  const { values } = parseArgs({ args: argv, options: { project: { type: "string" }, "allow-writes": { type: "boolean" } }, strict: true });
  // An empty value would make the CLI fall back to pokemap.config.json, which may name a real game project.
  if (values.project !== undefined && values.project.trim() === "") throw new Error("--project needs a path");
  return { project: values.project, allowWrites: !!values["allow-writes"] };
}
