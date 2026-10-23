interface OverlayToggle {
  key: string;
  label: string;
  pressed: boolean;
  onClick: () => void;
}

export function OverlayToggleGroup({ toggles }: { toggles: OverlayToggle[] }) {
  return <div className="map-canvas__toggles" role="group" aria-label="Overlays">
    {toggles.map((toggle) => (
      <button key={toggle.key} type="button" className="map-canvas__btn" aria-pressed={toggle.pressed} onClick={toggle.onClick}>
        {toggle.label}
      </button>
    ))}
  </div>;
}
