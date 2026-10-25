import type { MouseEventHandler, PointerEventHandler, ReactEventHandler, ReactNode, RefObject } from "react";

interface MapCanvasViewportProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUrl: string;
  onImgLoad: () => void;
  onImgError?: ReactEventHandler<HTMLImageElement>;
  onPointerDown?: PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel?: PointerEventHandler<HTMLCanvasElement>;
  onLostPointerCapture?: PointerEventHandler<HTMLCanvasElement>;
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
export function MapCanvasViewport({ containerRef, imgRef, canvasRef, imageUrl, onImgLoad, onImgError, onPointerDown, onPointerCancel, onLostPointerCapture, width, height, onMouseDown, onMouseMove, onMouseUp, onMouseLeave, children }: MapCanvasViewportProps) {
  return (
    <div className="map-canvas__viewport" ref={containerRef}>
      <img ref={imgRef} src={imageUrl} onLoad={onImgLoad} onError={onImgError} alt="" className="map-canvas__source-image" />
      <canvas
        ref={canvasRef}
        className="map-canvas__stage"
        width={width}
        height={height}
        onPointerDown={onPointerDown}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
      {children}
    </div>
  );
}
