#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseMcpArgs } from "./args.js";
import { createPokemapServer } from "./server.js";

// Usage: node --import tsx packages/mcp/src/index.ts [--project <decomp root>] [--allow-writes]
let args;
try {
  args = parseMcpArgs(process.argv.slice(2));
} catch (e) {
  console.error(`pokemap-mcp: ${(e as Error).message}
usage: [--project <decomp root>] [--allow-writes]`);
  process.exit(2);
}
console.error(`pokemap-mcp: project ${args.project ?? "(pokemap.config.json default)"}, writes ${args.allowWrites ? "ENABLED" : "disabled"}`);
await createPokemapServer(args).connect(new StdioServerTransport());
