import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** A thumbnail's identity for "these look the same"; null = unknown (never uniform). */
export type ThumbSignature = (img: HTMLImageElement) => string | null;

/** FNV-1a over the decoded pixels. Thumbnails are same-origin (`/api/metatile/...`), so the canvas is not tainted. */
export const canvasSignature: ThumbSignature = (img) => {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.width > 0 ? c.getContext("2d") : null;
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i]!, 16777619);
    return `${c.width}x${c.height}:${h >>> 0}`;
  } catch {
    return null;
  }
};

/** Plan 9 addendum R-F3: the rows (indices into `rows`) whose loaded thumbnails are all pixel-identical, a safe
 *  newspaper fold. `key` names what the thumbnails show (layout, map + time); a new key forgets every signature. */
export function useUniformRows(rows: readonly (readonly number[])[], key: string, signature: ThumbSignature = canvasSignature) {
  const sigs = useRef(new Map<number, string | null>());
  const sigKey = useRef(key);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ponytail: one re-render per 30 ms of thumbnail loads, not one per image (784 GBA thumbnails load at mount).
  const bump = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setVersion((v) => v + 1);
    }, 30);
  }, []);
  useEffect(() => () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } }, []);

  if (sigKey.current !== key) {
    sigKey.current = key;
    sigs.current = new Map();
  }

  const onThumbLoad = useCallback((id: number, img: HTMLImageElement) => {
    sigs.current.set(id, signature(img));
    bump();
  }, [signature, bump]);
  const onThumbError = useCallback((id: number) => {
    sigs.current.set(id, null);
    bump();
  }, [bump]);

  const uniformRows = useMemo(() => {
    void version; // recomputed when a batch of signatures lands
    const out = new Set<number>();
    rows.forEach((row, r) => {
      if (row.length < 2) return;
      const first = sigs.current.get(row[0]!);
      if (first && row.every((id) => sigs.current.get(id) === first)) out.add(r);
    });
    return out;
  }, [rows, version, key]);

  return { uniformRows, onThumbLoad, onThumbError };
}
