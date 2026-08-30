import {
  actionBar,
  btnClass,
  phaseDot,
  phaseSub,
  phaseTitle,
  playLayout,
  playMiddle,
} from '../ui';

export function BidReadyScreen({
  roundNumber,
  handSize,
  firstPlayName,
  forceBurn,
  bids,
  buttonLabel,
  onGoToScoring,
}: {
  roundNumber: number;
  handSize: number;
  firstPlayName: string;
  forceBurn: boolean;
  bids: { id: string; name: string; bid: number; last?: boolean }[];
  buttonLabel: string;
  onGoToScoring: () => void;
}) {
  return (
    <div className={playLayout}>
      <header className="min-w-0 shrink-0 px-2 pb-2 pt-7 text-center short:pt-4">
        <p className="mb-2 text-kicker font-bold uppercase tracking-widest text-grey-500">
          Bids locked
        </p>
        <h2 className={phaseTitle}>Round {roundNumber}</h2>
        <p className={phaseSub}>
          {handSize} {handSize === 1 ? 'card' : 'cards'}
          {forceBurn ? (
            <>
              <span className={phaseDot}>·</span>
              FB
            </>
          ) : null}
        </p>
        <p className="mt-4 flex flex-col items-center gap-0.5 font-display text-page font-650 leading-tight text-grey-900 short:mt-2.5 short:text-lg">
          <span className="font-sans text-kicker font-bold uppercase tracking-widest text-grey-500">
            First play
          </span>
          {firstPlayName}
        </p>
      </header>
      <div className={playMiddle}>
        <ol className="mx-2 mt-3 min-w-0 list-none overflow-y-auto rounded border border-line-strong bg-sand-100 px-4 py-1 short:mt-1.5 short:px-3.5">
          {bids.map((b) => (
            <li
              key={b.id}
              className="flex min-w-0 items-baseline justify-between gap-4 border-b border-sand-300 py-3 last:border-b-0 short:py-2"
            >
              <span className="min-w-0 truncate text-md font-medium text-grey-800">
                {b.name}
                {b.last ? (
                  <span className="text-kicker font-semibold lowercase tracking-wide text-muted">
                    {' '}
                    last
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-display text-2xl font-bold leading-none tabular-nums text-grey-900 short:text-xl">
                {b.bid}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className={actionBar}>
        <button
          type="button"
          className={btnClass({ kind: 'primary', block: true })}
          onClick={onGoToScoring}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
