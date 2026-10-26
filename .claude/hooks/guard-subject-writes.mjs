// PreToolUse hook: asks before any Edit/Write/NotebookEdit that lands inside a subject
// or reference repo listed in pokemap.config.json. CLAUDE.md treats writes to subject
// source repos as a high-risk trigger, so they need the user's explicit OK.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!target) process.exit(0);

let config;
try {
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  config = JSON.parse(readFileSync(join(root, 'pokemap.config.json'), 'utf8'));
} catch {
  process.exit(0);
}
const roots = [
  config.projectPath,
  ...(config.referenceProjects ?? []),
  config.gbc?.projectPath,
  ...(config.gbc?.referenceProjects ?? []),
].filter(Boolean).map(norm);

const t = norm(target);
const hit = roots.find((r) => t === r || t.startsWith(r + '/'));
if (!hit) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: `Write into subject/reference repo ${hit} (high-risk tier per CLAUDE.md). Approve only if intended.`,
  },
}));
