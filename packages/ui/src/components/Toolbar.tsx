import "../styles.css";

export type ToolKind = "pencil" | "rect" | "bucket" | "dropper" | "shift" | "collision";

const TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];

export interface ToolbarProps {
  activeToolKind: ToolKind | null;
  onSelectTool: (kind: ToolKind) => void;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenSave: () => void;
}

/**
 * Docked edit-mode toolbar -- tool selection, undo/redo, and the single
 * entry point into SaveDialog. Per invariant I6, no other control anywhere
 * in this app writes to disk; this button (disabled until `isDirty`) is the
 * only door into that flow.
 *
 * `dropper` and `shift` render here as selectable tools, matching Porymap's
 * own toolbox, but App.tsx currently has no MapCanvas-side behaviour wired
 * for either kind (only pencil/rect/bucket/collision are -- see MapCanvas
 * .tsx's own `paintAt`/`onMouseDown` dispatch) -- selecting them is a
 * deliberately inert no-op today (App.tsx maps them to a null `activeTool`,
 * the same "no tool selected" state MapCanvas already treats as plain
 * panning). Flagged as a follow-up, not built here -- see this task's own
 * report.
 */
export function Toolbar({ activeToolKind, onSelectTool, isDirty, onUndo, onRedo, canUndo, canRedo, onOpenSave }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__tools" role="group" aria-label="Tools">
        {TOOLS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={kind}
            aria-pressed={activeToolKind === kind}
            className="map-canvas__btn toolbar__tool-btn"
            onClick={() => onSelectTool(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="toolbar__history" role="group" aria-label="History">
        <button type="button" aria-label="Undo" onClick={onUndo} disabled={!canUndo} className="map-canvas__btn">
          ↶ Undo
        </button>
        <button type="button" aria-label="Redo" onClick={onRedo} disabled={!canRedo} className="map-canvas__btn">
          ↷ Redo
        </button>
      </div>
      <div className="toolbar__save">
        {isDirty && <span data-testid="dirty-indicator" className="toolbar__dirty-dot" title="Unsaved changes" />}
        <button
          type="button"
          aria-label="Save Changes"
          onClick={onOpenSave}
          disabled={!isDirty}
          className="map-canvas__btn toolbar__save-btn"
        >
          {isDirty ? "Save (unsaved changes)" : "Save"}
        </button>
      </div>
    </div>
  );
}
