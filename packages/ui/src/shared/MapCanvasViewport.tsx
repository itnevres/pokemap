import type { MouseEventHandler, ReactNode, RefObject } from "react";

interface MapCanvasViewportProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUrl: string;
  onImgLoad: () => void;
  width: number;
  height: number;
  onMouseDown: MouseEventHandler<HTMLCanvasElement>;
  onMouseMove: MouseEventHandler<HTMLCanvasElement>;
  onMouseUp: MouseEventHandler<HTMLCanvasElement>;
  onMouseLeave: MouseEventHandler<HTMLCanvasElement>;
  /** The family's EncounterBorder (its geometry, band and time differ). */
  children: ReactNode;
}

/** The map canvas mount: hidden source image, the stage canvas, then the family's overlay children. */
export function MapCanvasViewport({ containerRef, imgRef, canvasRef, imageUrl, onImgLoad, width, height, onMouseDown, onMouseMove, onMouseUp, onMouseLeave, children }: MapCanvasViewportProps) {
  return (
    <div className="map-canvas__viewport" ref={containerRef}>
      <img ref={imgRef} src={imageUrl} onLoad={onImgLoad} alt="" className="map-canvas__source-image" />
      <canvas
        ref={canvasRef}
        className="map-canvas__stage"
        width={width}
        height={height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
      {children}
    </div>
  );
}
