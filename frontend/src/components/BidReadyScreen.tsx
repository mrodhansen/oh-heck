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
    <div className="play-layout bid-ready">
      <header className="bid-ready-header">
        <p className="bid-ready-kicker">Bids locked</p>
        <h2 className="phase-title">Round {roundNumber}</h2>
        <p className="phase-sub">
          {handSize} {handSize === 1 ? 'card' : 'cards'}
          {forceBurn ? (
            <>
              <span className="phase-dot">·</span>
              FB
            </>
          ) : null}
        </p>
        <p className="bid-ready-lead">
          <span className="bid-ready-lead-label">First play</span>
          {firstPlayName}
        </p>
      </header>
      <div className="play-middle">
        <ol className="bid-ready-sheet">
          {bids.map((b) => (
            <li key={b.id} className="bid-ready-row">
              <span className="bid-ready-name truncate">
                {b.name}
                {b.last ? (
                  <span className="bid-ready-last"> last</span>
                ) : null}
              </span>
              <span className="bid-ready-bid">{b.bid}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="action-bar">
        <button
          type="button"
          className="btn primary block"
          onClick={onGoToScoring}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
