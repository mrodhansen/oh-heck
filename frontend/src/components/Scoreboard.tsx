import { GameDetail } from '../api';

type Props = {
  game: GameDetail;
  onEditRound?: (roundNumber: number) => void;
};

export function Scoreboard({ game, onEditRound }: Props) {
  const orderedStandings = [...game.standings].sort((a, b) => a.place - b.place);

  return (
    <div className="stack">
      <section className="card">
        <h3 className="section-title">Standings</h3>
        <div>
          {orderedStandings.map((s) => (
            <div key={s.playerId} className="standing-row">
              <div className="row" style={{ gap: 12 }}>
                <span
                  className={`place ${
                    s.place === 1
                      ? 'gold'
                      : s.place === 2
                        ? 'silver'
                        : s.place === 3
                          ? 'bronze'
                          : ''
                  }`}
                >
                  {s.place}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.playerName}</div>
                  <div className="hint">
                    Made {s.bidsMade}/{s.roundsPlayed}
                  </div>
                </div>
              </div>
              <div className={`score ${s.total >= 0 ? 'pos' : 'neg'}`}>
                {s.total}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Scoreboard</h3>
        <div className="table-scroll">
          <table className="scoreboard">
            <thead>
              <tr>
                <th>Rnd</th>
                {game.players.map((p) => (
                  <th key={p.id}>{shortName(p.name)}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {game.rounds.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.number}
                    <span className="muted"> ({r.handSize})</span>
                    {r.forceBurn ? (
                      <span className="muted"> FB</span>
                    ) : null}
                  </td>
                  {game.players.map((p) => {
                    const e = r.entries.find((x) => x.playerId === p.id);
                    if (!e || e.points === null) {
                      return (
                        <td key={p.id} className="muted">
                          {e?.bid != null ? `b${e.bid}` : '—'}
                        </td>
                      );
                    }
                    const made = e.bid === e.tricksTaken;
                    return (
                      <td key={p.id}>
                        <span className={made ? 'score pos' : 'score neg'}>
                          {e.points > 0 ? `+${e.points}` : e.points}
                        </span>
                        <div className="hint">
                          {e.tricksTaken}/{e.bid}
                        </div>
                      </td>
                    );
                  })}
                  <td>
                    {onEditRound && r.complete && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => onEditRound(r.number)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Total</td>
                {game.players.map((p) => {
                  const s = game.standings.find((x) => x.playerId === p.id);
                  return (
                    <td key={p.id}>
                      <span
                        className={
                          s && s.total >= 0 ? 'score pos' : 'score neg'
                        }
                      >
                        {s?.total ?? 0}
                      </span>
                    </td>
                  );
                })}
                <td></td>
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
