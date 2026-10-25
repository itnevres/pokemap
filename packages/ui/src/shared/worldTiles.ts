/** Builds the cached low-detail image; callers retain ownership of image loading and cache updates. */
export function buildSmallTile(image: CanvasImageSource, width: number, height: number, tilePx: number, scale: number): HTMLCanvasElement {
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(width * tilePx * scale));
  small.height = Math.max(1, Math.round(height * tilePx * scale));
  const context = small.getContext("2d");
  if (context) {
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, small.width, small.height);
  }
  return small;
}
