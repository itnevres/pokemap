import { useState } from "react";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import { FamilyApp } from "./shell/FamilyApp.js";
import { gbaAdapter } from "./gba/adapter.js";
import { gbcAdapter } from "./gbc/adapter.js";
import { ProjectPicker } from "./hub/ProjectPicker.js";
import { ProjectSwitcher } from "./hub/ProjectSwitcher.js";
import { isHubState } from "./hub/guards.js";
import { useGuardedFetch } from "./hooks/useGuardedFetch.js";

/**
 * Family bootstrap + project hub entry point (Plan 6b Task 3 / Plan 6c A2).
 * Fetches `/api/hub` once (`{ current, recent }`) and mounts the matching
 * `FamilyApp` with the matching family's adapter once a project is open, or
 * `ProjectPicker` (no modal shell -- there's nothing to close back to) when
 * none is.
 *
 * `opened` is this component's own "the user just (re)opened a project
 * through the hub UI" state -- it takes precedence over whatever `/api/hub`
 * itself last reported (`current`), which only reflects the state as of
 * mount/last poll. `key = family:root:gen` on the mounted shell means: a
 * DIFFERENT project (family or root changed) remounts it fresh, same as
 * before this task; a FORCED re-open of the SAME root (`gen` bumped) also
 * remounts it, because a forced open drops the server's in-memory sessions
 * for that root (`hub.ts`'s own handler swap) and the client's own React
 * state must not survive that swap either.
 */
export function Root() {
  const { data, error } = useGuardedFetch("/api/hub", isHubState);
  const [opened, setOpened] = useState<{ info: ProjectInfo; gen: number } | null>(null);
  const current = opened?.info ?? data?.current ?? null;
  const onOpened = (info: ProjectInfo) => setOpened((o) => ({ info, gen: (o?.gen ?? 0) + 1 }));

  if (!current) {
    if (error) {
      return (
        <div className="app">
          <p role="alert">Could not open project: {error}</p>
        </div>
      );
    }
    if (!data) {
      return (
        <div className="app">
          <p className="app__canvas-placeholder">Loading project…</p>
        </div>
      );
    }
    return (
      <div className="app">
        <ProjectPicker onOpened={onOpened} />
      </div>
    );
  }

  const { family, root } = current;
  const key = `${family}:${root}:${opened?.gen ?? 0}`;
  const switcher = <ProjectSwitcher current={current} onOpened={onOpened} />;

  return <FamilyApp key={key} adapter={family === "gbc" ? gbcAdapter : gbaAdapter} switcher={switcher} />;
}
