#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPokemapServer } from "./server.js";

// Usage: node --import tsx packages/mcp/src/index.ts [--project <decomp root>] [--allow-writes]
const i = process.argv.indexOf("--project");
const project = i >= 0 ? process.argv[i + 1] : undefined;
await createPokemapServer({ project, allowWrites: process.argv.includes("--allow-writes") }).connect(new StdioServerTransport());
