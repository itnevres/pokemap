/** Plan 9 (R4): the palette header's "Follow hover" switch -- same switch pattern as the World bar's toggles. */
export function FollowHoverSwitch({ on, onChange }: { on: boolean; onChange(next: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="world-canvas__switch palette__follow" onClick={() => onChange(!on)}>
      Follow hover
    </button>
  );
}
