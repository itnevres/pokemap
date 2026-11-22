import { parseArgs } from "node:util";

export interface McpArgs { project?: string; allowWrites: boolean }

/** Parses `[--project <path> | --project=<path>] [--allow-writes]`; throws on a missing value or an unknown option. */
export function parseMcpArgs(argv: string[]): McpArgs {
  const { values } = parseArgs({ args: argv, options: { project: { type: "string" }, "allow-writes": { type: "boolean" } }, strict: true });
  return { project: values.project, allowWrites: !!values["allow-writes"] };
}
