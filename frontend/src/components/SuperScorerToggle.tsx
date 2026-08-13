export function SuperScorerToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`super-scorer-toggle ${on ? 'on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <span className="super-scorer-toggle-text">
        <strong>Super scorer</strong>
        <span>Record every card. Tricks fill in automatically.</span>
      </span>
      <span className="super-scorer-switch" aria-hidden>
        <span className="super-scorer-knob" />
      </span>
    </button>
  );
}
