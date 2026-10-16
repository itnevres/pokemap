// jsdom elements measure 0x0. Tests fake a viewport by defining clientWidth/clientHeight on
// HTMLElement.prototype. jsdom itself defines them on Element.prototype, so the stub is an own
// property of HTMLElement.prototype and restoring means deleting it (saving its descriptor first
// gives `undefined` and a "restore if saved" never runs: Plan 9 final review m1).

export function stubViewport(width: number, height: number = width): void {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: height, configurable: true });
}

export function restoreViewport(): void {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
}

export async function withViewport(fn: () => Promise<void>, width = 100, height = 100): Promise<void> {
  stubViewport(width, height);
  try {
    await fn();
  } finally {
    restoreViewport();
  }
}
