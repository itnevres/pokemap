import type { ComponentType, ReactNode } from "react";

/** The shared editing shell used by both map families. It keeps the body and
 * canvas in one position while active chrome appears around them. */
export interface WorkspaceSlots<CanvasProps> {
  /** Rendered only while active, before the stable body (toolbar, banners). */
  top: ReactNode;
  /** The right-hand rail's children (Plan 9 D4), rendered only while active inside `.edit-rail` after the canvas.
   *  Null renders no rail. */
  side: ReactNode;
  /** Null while there is no map (inactive host before load). */
  canvasProps: CanvasProps | null;
  /** The family's own canvas, used when renderCanvas is absent. */
  Canvas: ComponentType<CanvasProps>;
}

export function EditingWorkspace<CanvasProps>({ active, top, side, canvasProps, Canvas, renderCanvas }: WorkspaceSlots<CanvasProps> & {
  active: boolean;
  renderCanvas?: (canvasProps: CanvasProps | null) => ReactNode;
}) {
  const canvas = renderCanvas ? renderCanvas(canvasProps) : canvasProps && <Canvas {...canvasProps} />;
  return <>{active && top}<div className="app__map-editing-body">{canvas}{active && side ? <div className="edit-rail">{side}</div> : null}</div></>;
}
