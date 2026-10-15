/** Plan 9 (R4): the palette header's "Follow hover" switch -- same switch pattern as the World bar's toggles. */
export function FollowHoverSwitch({ on, onChange }: { on: boolean; onChange(next: boolean): void }) {
  return (
    <div className="palette__follow">
      <button type="button" role="switch" aria-checked={on} aria-label="Follow hover" className="world-canvas__switch" onClick={() => onChange(!on)}>
        <span className="world-canvas__switch-thumb" />
      </button>
      <span className="world-canvas__switch-label">Follow hover</span>
    </div>
  );
}
