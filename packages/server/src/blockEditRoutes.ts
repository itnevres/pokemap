import type { IncomingMessage } from "node:http";
import type { Project } from "@pokemap/core/src/project.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import type { FileOverlay } from "@pokemap/core/src/blockEdit/types.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { createGbcEditSessionStore } from "./gbcEditSessions.js";

type Send = (code: number, body: unknown) => void;
type Routes = { handle(req: IncomingMessage, url: URL, send: Send): boolean };
type CommonDeps = {
  syncOverlay(): number;
  overlay(): FileOverlay;
  sessionBody(name: string): unknown;
  hasMap(name: string): boolean;
};

export function createGbaBlockEditRoutes(
  deps: CommonDeps & { project: Project; store: ReturnType<typeof createEditSessionStore> },
): Routes {
  throw new Error("not implemented (Task 11a)");
}

export function createGbcBlockEditRoutes(
  deps: CommonDeps & { project: GbcProject; store: ReturnType<typeof createGbcEditSessionStore> },
): Routes {
  throw new Error("not implemented (Task 11a)");
}
