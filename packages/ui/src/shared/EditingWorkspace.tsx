import type { ComponentType, ReactNode } from "react";

/** The shared editing shell used by both map families. It keeps the body and
 * canvas in one position while active chrome appears around them. */
export interface WorkspaceSlots<CanvasProps> {
  /** Rendered only while active, before the stable body (toolbar, strips, banners). */
  top: ReactNode;
  /** Rendered only while active, inside the body after the canvas (inspector / rail). */
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
  return <>{active && top}<div className="app__map-editing-body">{canvas}{active && side}</div></>;
}
