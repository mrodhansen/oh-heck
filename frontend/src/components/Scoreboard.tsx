import { GameDetail } from '../api';
import {
  btnClass,
  card,
  cn,
  hint,
  muted,
  place,
  placeTone,
  row,
  score,
  scoreNeg,
  scorePos,
  sectionTitle,
  stack,
} from '../ui';

type Props = {
  game: GameDetail;
  onEditRound?: (roundNumber: number) => void;
  /** Show Edit even when the round is not complete (import preview). */
  allowIncompleteEdit?: boolean;
  variant?: 'default' | 'tv';
  showStandings?: boolean;
};

export function Scoreboard({
  game,
  onEditRound,
  allowIncompleteEdit = false,
  variant = 'default',
  showStandings = true,
}: Props) {
  const orderedStandings = [...game.standings].sort((a, b) => a.place - b.place);
  const isTv = variant === 'tv';
  const editRound = onEditRound;
  const showEditCol = Boolean(editRound) && !isTv;

  return (
    <div className={cn(stack, isTv && 'tv-scoreboard')}>
      {showStandings ? (
      <section className={card}>
        <h3 className={sectionTitle}>Standings</h3>
        <div>
          {orderedStandings.map((s) => (
            <div
              key={s.playerId}
              className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className={cn(row, 'gap-3')}>
                <span className={cn(place, placeTone(s.place))}>
                  {s.place}
                </span>
                <div>
                  <div className="font-semibold">{s.playerName}</div>
                  <div className={hint}>
                    Made {s.bidsMade}/{s.roundsPlayed}
                  </div>
                </div>
              </div>
              <div className={cn(score, s.total >= 0 ? scorePos : scoreNeg)}>
                {s.total}
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      <section className={card}>
        <h3 className={sectionTitle}>Scoreboard</h3>
        <div className="table-scroll">
          <table className="scoreboard">
            <thead>
              <tr>
                <th>Rnd</th>
                {game.players.map((p) => (
                  <th key={p.id}>{isTv ? p.name : shortName(p.name)}</th>
                ))}
                {showEditCol ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {game.rounds.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.number}
                    <span className={muted}> ({r.handSize})</span>
                    {r.forceBurn ? (
                      <span className={muted}> FB</span>
                    ) : null}
                  </td>
                  {game.players.map((p) => {
                    const e = r.entries.find((x) => x.playerId === p.id);
                    const forceBurnCell =
                      r.forceBurn &&
                      (p.id === r.dealerPlayerId ||
                        p.seatIndex === r.dealerSeat);
                    if (!e || e.points === null) {
                      return (
                        <td
                          key={p.id}
                          className={cn(
                            muted,
                            forceBurnCell && 'score-force-burn',
                          )}
                        >
                          {e?.bid != null ? `b${e.bid}` : '—'}
                        </td>
                      );
                    }
                    const made = e.bid === e.tricksTaken;
                    return (
                      <td
                        key={p.id}
                        className={cn(
                          !made && 'score-miss',
                          forceBurnCell && 'score-force-burn',
                        )}
                      >
                        <span className={cn(score, made ? scorePos : scoreNeg)}>
                          {e.points > 0 ? `+${e.points}` : e.points}
                        </span>
                        <div className={hint}>
                          {e.tricksTaken}/{e.bid}
                        </div>
                      </td>
                    );
                  })}
                  {showEditCol ? (
                    <td>
                      {(r.complete || allowIncompleteEdit) && (
                        <button
                          type="button"
                          className={btnClass({ kind: 'ghost', size: 'sm' })}
                          onClick={() => {
                            if (!editRound) {
                              throw new Error('Missing edit handler');
                            }
                            editRound(r.number);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr>
                <td>Total</td>
                {game.players.map((p) => {
                  const s = game.standings.find((x) => x.playerId === p.id);
                  return (
                    <td
                      key={p.id}
                      className={s && s.total < 0 ? 'score-miss' : undefined}
                    >
                      <span
                        className={cn(
                          score,
                          s && s.total >= 0 ? scorePos : scoreNeg,
                        )}
                      >
                        {s?.total ?? 0}
                      </span>
                    </td>
                  );
                })}
                {showEditCol ? <td></td> : null}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function shortName(name: string): string {
  if (name.length <= 8) return name;
  return `${name.slice(0, 7)}…`;
}
