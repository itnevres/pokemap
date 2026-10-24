import type React from "react";
import { ZOOM_LEVELS, type MapView } from "../components/mapView.js";
import { ContextMapFit, type WorldContext } from "./useWorldContext.js";

/** The in-context editing overlay, shared by both world canvases. It fills the world viewport box exactly, so the
 *  chromeless map canvas's stage box equals the world canvas box and the controlled view maps one to one (see
 *  world/contextView.ts). Module-level on purpose: defining it inside a canvas body would remount it every render. */
export function WorldContextOverlay({ map, ctx, renderCanvas, onDone }: {
  map: string;
  ctx: WorldContext;
  renderCanvas(view: MapView, onViewChange: (v: MapView) => void): React.ReactNode;
  onDone(): void;
}) {
  const { contextView } = ctx;
  return (
    <div ref={ctx.overlayRef} className="world-canvas__context" onDoubleClick={ctx.onOverlayDoubleClick}>
      <div className="world-canvas__context-dim" aria-hidden="true" />
      {contextView && renderCanvas(contextView, ctx.onContextViewChange)}
      <div className="world-canvas__context-bar" role="group" aria-label={`Editing ${map} in place`}>
        <span className="world-canvas__context-name">{map}</span>
        <div className="world-canvas__context-zoom" role="group" aria-label="Zoom">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              type="button"
              className="map-canvas__btn"
              aria-pressed={contextView?.zoom === z}
              disabled={!contextView}
              onClick={() => ctx.setContextZoom(z)}
            >
              {z}×
            </button>
          ))}
        </div>
        <button type="button" className="map-canvas__btn" aria-label={`Done editing ${map}`} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Keeps the conditional context mount (including the fit-provider boundary) identical in both world canvases. */
export function WorldContextOverlayMount({ context, ctx }: {
  context: { map: string; renderCanvas(view: MapView, onViewChange: (v: MapView) => void): React.ReactNode; onExitRequest(): void } | undefined;
  ctx: WorldContext;
}) {
  return context && <WorldContextOverlay map={context.map} ctx={ctx} renderCanvas={(view, onViewChange) => <ContextMapFit.Provider value={ctx.registerFit}>{context.renderCanvas(view, onViewChange)}</ContextMapFit.Provider>} onDone={() => context.onExitRequest()} />;
}
