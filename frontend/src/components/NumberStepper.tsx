import { hint, stepper, stepperBtn, stepperValue } from '../ui';
import { cn } from '../cn';

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
    <div className={stepper}>
      <button
        type="button"
        className={stepperBtn}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
      >
        −
      </button>
      <div className={stepperValue}>
        {ofTotal != null ? (
          <>
            {value}
            <span className="text-kicker font-semibold text-muted">
              /{ofTotal}
            </span>
          </>
        ) : (
          value
        )}
        {forbidden !== null && forbidden !== undefined && value === forbidden ? (
          <div className={cn(hint, 'mt-1 font-sans text-kicker font-medium text-danger')}>
            illegal
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={stepperBtn}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
