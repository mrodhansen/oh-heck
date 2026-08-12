import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, StatsGame, StatsPlayer, StatsResponse, StatsLeader } from '../api';

type Tab = 'overview' | 'games' | 'players';

export function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const playerKey = (p: StatsPlayer) => p.key ?? p.name;

  useEffect(() => {
    let alive = true;
    api
      .getStats()
      .then((s) => {
        if (alive) {
          setStats(s);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) {
          setStats(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="empty fill-center">Loading stats…</div>;
  if (error) return <div className="banner">{error}</div>;
  if (!stats) return <div className="empty">Stats unavailable.</div>;

  const player =
    selectedPlayer != null
      ? stats.players.find((p) => playerKey(p) === selectedPlayer) ?? null
      : null;

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">Stats</h2>
        <div className="stats-tabs" role="tablist">
          <button
            type="button"
            className={tab === 'overview' ? 'active' : ''}
            onClick={() => {
              setTab('overview');
              setSelectedPlayer(null);
            }}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === 'games' ? 'active' : ''}
            onClick={() => {
              setTab('games');
              setSelectedPlayer(null);
            }}
          >
            Games
          </button>
          <button
            type="button"
            className={tab === 'players' ? 'active' : ''}
            onClick={() => setTab('players')}
          >
            Players
          </button>
        </div>
      </div>

      <div className="page-fit-body stack">
        {tab === 'overview' && <OverviewPanel stats={stats} />}
        {tab === 'games' && <GamesPanel games={stats.games} />}
        {tab === 'players' && !player && (
          <PlayersList
            players={stats.players}
            onSelect={(key) => setSelectedPlayer(key)}
          />
        )}
        {tab === 'players' && player && (
          <PlayerDetail
            player={player}
            onBack={() => setSelectedPlayer(null)}
          />
        )}
      </div>
    </div>
  );
}

function OverviewPanel({ stats }: { stats: StatsResponse }) {
  const { overview, leaders } = {
    overview: stats.overview,
    leaders: stats.overview.leaders,
  };

  return (
    <>
      <div className="stats-grid">
        <Metric label="Completed games" value={overview.completedGames} />
        <Metric label="Players" value={overview.uniquePlayers} />
        <Metric label="Rounds logged" value={overview.totalRoundsPlayed} />
        <Metric label="Force burns" value={overview.totalForceBurns} />
      </div>

      <section className="card">
        <h3 className="section-title">Leaders</h3>
        {stats.players.length === 0 ? (
          <p className="empty" style={{ padding: 12 }}>
            Play a game to unlock leaders.
          </p>
        ) : (
          <div className="leader-list">
            <LeaderRow label="Most wins" leader={leaders.mostWins} />
            <LeaderRow label="Highest avg score" leader={leaders.highestAvg} />
            <LeaderRow label="Best single game" leader={leaders.bestSingleGame} />
            <LeaderRow label="Worst single game" leader={leaders.worstSingleGame} />
            <LeaderRow label="Best bid %" leader={leaders.bestBidAccuracy} />
            <LeaderRow label="Most nils made" leader={leaders.mostNils} />
            <LeaderRow label="Biggest round" leader={leaders.biggestRound} />
            <LeaderRow label="Most podiums" leader={leaders.mostPodiums} />
            <LeaderRow label="Most force burns" leader={leaders.mostForceBurns} />
            <LeaderRow label="Perfect games" leader={leaders.perfectGames} />
            <LeaderRow label="Biggest win margin" leader={leaders.biggestMargin} />
          </div>
        )}
      </section>
    </>
  );
}

function GamesPanel({ games }: { games: StatsGame[] }) {
  if (games.length === 0) {
    return (
      <div className="card empty">No completed games yet.</div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Players</th>
              <th>Winner</th>
              <th>High</th>
              <th>Low</th>
              <th>FB</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link to={`/games/${g.id}`} className="table-link">
                    <span className="table-primary">
                      {g.name ?? 'Untitled'}
                    </span>
                    <span className="table-secondary">
                      {formatDate(g.finishedAt ?? g.createdAt)}
                    </span>
                  </Link>
                </td>
                <td>{g.playerCount}</td>
                <td>
                  {g.winner ? (
                    <>
                      {g.winner}
                      {g.winnerScore != null ? (
                        <span className="muted"> ({g.winnerScore})</span>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{fmt(g.highScore)}</td>
                <td>{fmt(g.lowScore)}</td>
                <td>{g.forceBurns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlayersList({
  players,
  onSelect,
}: {
  players: StatsPlayer[];
  onSelect: (key: string) => void;
}) {
  if (players.length === 0) {
    return <div className="card empty">No players yet.</div>;
  }

  return (
    <div className="list">
      {players.map((p) => (
        <button
          key={p.key ?? p.name}
          type="button"
          className="list-item list-item-btn"
          onClick={() => onSelect(p.key ?? p.name)}
        >
          <div className="min-w-0">
            <p className="list-item-title truncate">
              {p.name}
              {p.userId ? (
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}
                  · account
                </span>
              ) : null}
            </p>
            <p className="list-item-meta">
              {p.wins} win{p.wins === 1 ? '' : 's'}
              {p.avgScore != null ? ` · avg ${p.avgScore}` : ''}
              {p.bidAccuracy != null ? ` · ${p.bidAccuracy}% bids` : ''}
            </p>
          </div>
          <span className="list-item-chevron" aria-hidden>
            ›
          </span>
        </button>
      ))}
    </div>
  );
}

function PlayerDetail({
  player,
  onBack,
}: {
  player: StatsPlayer;
  onBack: () => void;
}) {
  return (
    <div className="stack">
      <button type="button" className="btn ghost sm back-inline" onClick={onBack}>
        ← Players
      </button>
      <div className="row space-between">
        <h3 className="page-title" style={{ fontSize: '1.25rem' }}>
          {player.name}
        </h3>
        <span className="status ok">
          {player.wins} win{player.wins === 1 ? '' : 's'}
        </span>
      </div>
      <div className="stats-grid">
        <Metric label="Games played" value={player.gamesPlayed} />
        <Metric label="Finished" value={player.gamesCompleted} />
        <Metric label="Win rate" value={pct(player.winRate)} />
        <Metric label="Avg score" value={fmt(player.avgScore)} />
        <Metric label="Best game" value={fmt(player.bestScore)} />
        <Metric label="Worst game" value={fmt(player.worstScore)} />
        <Metric label="1st / 2nd / 3rd" value={`${player.wins}/${player.seconds}/${player.thirds}`} />
        <Metric label="Podiums" value={player.podium} />
        <Metric label="Bid accuracy" value={pct(player.bidAccuracy)} />
        <Metric label="Bids made" value={`${player.bidsMade}/${player.roundsPlayed}`} />
        <Metric label="Nils made" value={`${player.nilsMade}/${player.nilBids}`} />
        <Metric label="Nil rate" value={pct(player.nilSuccessRate)} />
        <Metric label="Overtricks" value={player.overtricks} />
        <Metric label="Undertricks" value={player.undertricks} />
        <Metric label="Best round" value={fmt(player.biggestRound)} />
        <Metric label="Worst round" value={fmt(player.smallestRound)} />
        <Metric label="Force burns" value={player.forceBurns} />
        <Metric label="Perfect games" value={player.perfectGames} />
      </div>
    </div>
  );
}

function LeaderRow({ label, leader }: { label: string; leader: StatsLeader }) {
  return (
    <div className="leader-row">
      <span className="leader-label">{label}</span>
      {leader ? (
        <span className="leader-value">
          <strong>{leader.name}</strong>
          <span className="muted"> · {leader.value}</span>
        </span>
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: '1.1rem' }}>
        {value}
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return String(n);
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
