type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  forbidden?: number | null;
  /** When set, center shows `value/ofTotal` (e.g. got/bid). */
  ofTotal?: number | null;
};

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  disabled,
  forbidden,
  ofTotal,
}: Props) {
  return (
    <div className="stepper">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
      >
        −
      </button>
      <div className="value">
        {ofTotal != null ? (
          <>
            {value}
            <span className="value-of">/{ofTotal}</span>
          </>
        ) : (
          value
        )}
        {forbidden !== null && forbidden !== undefined && value === forbidden ? (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            illegal
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
