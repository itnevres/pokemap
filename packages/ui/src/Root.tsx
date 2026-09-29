import { App } from "./App.js";
import { GbcApp } from "./gbc/GbcApp.js";
import { useProjectInfo } from "./hooks/useProjectInfo.js";

/**
 * Family bootstrap (Plan 6b Task 3, plan Q2). Fetches `/api/project` once
 * and mounts the matching shell -- `App` (GBA, byte-identical, untouched)
 * or `GbcApp` (GBC). `App`'s own `useMapGroups` fetch cannot start before
 * this resolves `gba`, because `App` isn't mounted at all until then: a GBC
 * project never has any GBA-only request in flight.
 */
export function Root() {
  const { data, error } = useProjectInfo();

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

  if (data.family === "gbc") {
    return <GbcApp root={data.root} />;
  }

  return <App />;
}
