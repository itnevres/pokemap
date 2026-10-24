/** A world-toolbar on/off switch (Dungeon auto-layout, Warps, Connection lines), shared by both families' world
 *  canvases. The family owns the state and whatever else a click clears. */
export function WorldToolbarSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="world-canvas__toolbar-group">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className="world-canvas__switch"
        onClick={onToggle}
      >
        <span className="world-canvas__switch-thumb" />
      </button>
      <span className="world-canvas__switch-label">{label} {on ? "on" : "off"}</span>
    </div>
  );
}

/** The toolbar's "Dungeon auto-layout" switch, shared by both families' world canvases. */
export function DungeonAutoLayoutSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <WorldToolbarSwitch label="Dungeon auto-layout" on={on} onToggle={onToggle} />;
}
