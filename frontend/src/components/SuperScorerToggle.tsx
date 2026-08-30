import { cn } from '../cn';

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
      className={cn(
        'mt-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded-btn border px-3.5 py-3 text-left text-inherit',
        on
          ? 'border-grey-700 bg-sand-100 shadow-inset-sel'
          : 'border-line bg-surface',
      )}
      aria-pressed={on}
      onClick={onToggle}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-base font-semibold">Super scorer</strong>
        <span className="text-hint text-muted">
          Record every card. Tricks fill in automatically.
        </span>
      </span>
      <span
        className={cn(
          'relative h-badge w-tap shrink-0 overflow-hidden rounded-full border',
          on ? 'border-grey-800 bg-grey-800' : 'border-line-strong bg-sand-200',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-surface',
            on ? 'left-5' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
