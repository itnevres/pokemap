interface OverlayToggle {
  key: string;
  label: string;
  pressed: boolean;
  onClick: () => void;
}

/** Accessible names that differ from the visible label (P11-4): "Collision" here is the overlay, not the GBA toolbar's
 *  Collision tool. */
const TOGGLE_ACCESSIBLE_NAME: Record<string, string> = { collision: "Show collision overlay" };

export function OverlayToggleGroup({ toggles }: { toggles: OverlayToggle[] }) {
  return <div className="map-canvas__toggles" role="group" aria-label="Overlays">
    {toggles.map((toggle) => (
      <button key={toggle.key} type="button" className="map-canvas__btn" aria-pressed={toggle.pressed} aria-label={TOGGLE_ACCESSIBLE_NAME[toggle.key]} onClick={toggle.onClick}>
        {toggle.label}
      </button>
    ))}
  </div>;
}
