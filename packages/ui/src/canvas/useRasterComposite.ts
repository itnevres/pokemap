import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { View } from "./view.js";

export interface RasterLayer {
  key: string;
  enabled: boolean;
  // draw identity is ignored; include every captured raster input. Changed objects need new identities.
  deps: readonly unknown[];
  draw(raster: { width: number; height: number; data: Uint8ClampedArray }): void;
}

export interface RasterCompositeOptions {
  imageUrl: string;
  // Both ref objects must stay stable for the lifetime of this hook.
  imgRef: RefObject<HTMLImageElement | null>;
  stageRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  layers: readonly RasterLayer[];
  view: View;
  viewport: { w: number; h: number };
  decorate?: (ctx: CanvasRenderingContext2D) => void;
  // decorate identity is ignored; include every captured decoration input, replacing changed objects.
  decorateDeps: readonly unknown[];
}

function useStableValues(values: readonly unknown[]): readonly unknown[] {
  const previous = useRef<readonly unknown[]>([]);
  const stable = previous.current.length === values.length && values.every((value, i) => Object.is(value, previous.current[i]))
    ? previous.current : [...values];
  useLayoutEffect(() => {
    // Only committed snapshots may influence later renders; suspended work leaves no trace.
    previous.current = stable;
  }, [stable]);
  return stable;
}

export function useRasterComposite({
  imageUrl, imgRef, stageRef, width, height, layers, view, viewport, decorate, decorateDeps,
}: RasterCompositeOptions) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [compositeVersion, setCompositeVersion] = useState(0);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const currentUrlRef = useRef(imageUrl);
  const layersRef = useRef(layers);
  const decorateRef = useRef(decorate);
  useLayoutEffect(() => {
    // Events and passive effects must see committed callbacks, never speculative renders.
    currentUrlRef.current = imageUrl;
    layersRef.current = layers;
    decorateRef.current = decorate;
  });
  const imgLoaded = loadedUrl === imageUrl;

  // Lengths preserve entry boundaries, even when arbitrary deps resemble layer keys.
  const layerInputs = useStableValues(layers.flatMap((layer) => [
    layer.key, layer.enabled, layer.deps.length, ...layer.deps,
  ]));
  const decorationInputs = useStableValues(decorateDeps);

  useEffect(() => {
    const img = imgRef.current;
    // Cached images may already be decoded before their load event is observed.
    // naturalWidth excludes complete-but-broken images, including StrictMode re-entry.
    setLoadedUrl(img?.complete === true && img.naturalWidth > 0 ? imageUrl : null);
  }, [imageUrl]);

  const onImgLoad = useCallback(() => {
    // A retained handler from the previous URL must not unlock the current image.
    if (imageUrl === currentUrlRef.current) setLoadedUrl(currentUrlRef.current);
  }, [imageUrl]);

  const onImgError = useCallback(() => {
    if (imageUrl === currentUrlRef.current) setLoadedUrl(null);
  }, [imageUrl]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    let base = baseRef.current;
    if (!base) {
      base = document.createElement("canvas");
      baseRef.current = base;
    }
    if (base.width !== width) base.width = width;
    if (base.height !== height) base.height = height;
    const ctx = base.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imgRef.current, 0, 0);
    const currentLayers = layersRef.current;
    if (currentLayers.some((layer) => layer.enabled)) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const raster = { width, height, data: imageData.data };
      for (const layer of currentLayers) {
        if (layer.enabled) layer.draw(raster);
      }
      ctx.putImageData(imageData, 0, 0);
    }
    setCompositeVersion((version) => version + 1);
    // imageUrl also covers cached URL changes whose ready flag stays true.
  }, [imgLoaded, imageUrl, width, height, layerInputs]);

  useEffect(() => {
    const stage = stageRef.current;
    const base = baseRef.current;
    if (!stage || !base || compositeVersion === 0) return;
    const ctx = stage.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.drawImage(base, 0, 0, width, height, view.pan.x, view.pan.y, width * view.zoom, height * view.zoom);
    decorateRef.current?.(ctx);
    // Viewport changes clear a resized canvas, so they must trigger a fresh blit.
  }, [compositeVersion, view.zoom, view.pan.x, view.pan.y, viewport.w, viewport.h, width, height, decorationInputs]);

  return { imgLoaded, onImgLoad, onImgError, compositeVersion };
}
