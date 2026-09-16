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
  /** Task 17: opens SignComposer -- a one-shot modal authoring flow, not a
   *  canvas paint tool, so it is its own button rather than a seventh entry
   *  in `TOOLS` (which drives MapCanvas's activeTool selection). Not gated
   *  by `availableTools` (that mechanism only governs the six paint tools
   *  below): the wild-sign write path is fully wired this task, so the
   *  button renders enabled immediately, same as Undo/Redo/Save's own
   *  always-available posture. */
  onOpenSignComposer: () => void;
  /** Code-review fix: which tools actually have MapCanvas-side behaviour
   *  wired today. Every tool in `TOOLS` renders as a button (matching
   *  Porymap's own toolbox, and ready for the follow-up tasks that wire the
   *  rest), but a tool NOT in this list is disabled with a "not yet
   *  available" title rather than looking clickable-but-silently-inert --
   *  App.tsx's own `activeTool` translation resolves an unavailable tool to
   *  a null MapCanvas activeTool (same as "nothing selected"), so a player
   *  could otherwise select "pencil," click the map, see nothing happen,
   *  and reasonably conclude the app is broken. */
  availableTools: ToolKind[];
}

/**
 * Docked edit-mode toolbar -- tool selection, undo/redo, and the single
 * entry point into SaveDialog. Per invariant I6, no other control anywhere
 * in this app writes to disk; this button (disabled until `isDirty`) is the
 * only door into that flow.
 */
export function Toolbar({ activeToolKind, onSelectTool, isDirty, onUndo, onRedo, canUndo, canRedo, onOpenSave, onOpenSignComposer, availableTools }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__tools" role="group" aria-label="Tools">
        {TOOLS.map((kind) => {
          const available = availableTools.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-label={kind}
              aria-pressed={activeToolKind === kind}
              disabled={!available}
              title={available ? undefined : "Not yet available"}
              className="map-canvas__btn toolbar__tool-btn"
              onClick={() => onSelectTool(kind)}
            >
              {kind}
            </button>
          );
        })}
      </div>
      <div className="toolbar__history" role="group" aria-label="History">
        <button type="button" aria-label="Undo" onClick={onUndo} disabled={!canUndo} className="map-canvas__btn">
          ↶ Undo
        </button>
        <button type="button" aria-label="Redo" onClick={onRedo} disabled={!canRedo} className="map-canvas__btn">
          ↷ Redo
        </button>
      </div>
      <div className="toolbar__sign" role="group" aria-label="Sign">
        <button type="button" className="map-canvas__btn" onClick={onOpenSignComposer}>
          Add Sign
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
