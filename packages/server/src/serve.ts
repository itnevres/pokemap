#!/usr/bin/env node
// Dev entry point. `createServer` is a library function so tests can bind an
// ephemeral port; this is the thing you run by hand to look at the UI.
import { readFileSync } from "node:fs";
import { createServer } from "./index.js";

const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { projectPath: string };
const root = process.argv[2] ?? cfg.projectPath;

const s = await createServer({ projectPath: root, port: 5174 });
process.stdout.write(`pokemap server on http://127.0.0.1:${s.port} for ${root}\n`);
