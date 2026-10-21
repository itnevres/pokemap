/** The toolbar's "Dungeon auto-layout" switch, shared by both families' world canvases. */
export function DungeonAutoLayoutSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="world-canvas__toolbar-group">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Dungeon auto-layout"
        className="world-canvas__switch"
        onClick={onToggle}
      >
        <span className="world-canvas__switch-thumb" />
      </button>
      <span className="world-canvas__switch-label">Dungeon auto-layout {on ? "on" : "off"}</span>
    </div>
  );
}
