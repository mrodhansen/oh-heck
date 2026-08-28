import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, StatsGame, StatsPlayer, StatsResponse, StatsLeader } from '../api';
import { toUserMessage } from '../api/errors';
import { filterStatsGames } from './statsGamesFilter';
import { filterStatsPlayers } from './statsPlayersFilter';
import { paginate } from './statsPaginate';
import {
  dayEndMs,
  dayStartMs,
  playersForRange,
  playersForWindow,
  rankBestPlayers,
  type TopRange,
} from './bestPlayers';

const TABLE_PAGE_SIZE = 20;

type Tab = 'overview' | 'games' | 'players';

function tabFromState(state: unknown): Tab | undefined {
  if (!state || typeof state !== 'object' || !('tab' in state)) return undefined;
  const tab = state.tab;
  return tab === 'games' || tab === 'players' || tab === 'overview' ? tab : undefined;
}

export function StatsPage() {
  const location = useLocation();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() => {
    const from = tabFromState(location.state);
    return from === 'games' || from === 'players' ? from : 'overview';
  });
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
      .catch((e: unknown) => {
        if (alive) {
          setStats(null);
          setError(toUserMessage(e, 'Could not load stats'));
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

      <TopPlayers players={stats.players} games={stats.games} />

      <section className="card">
        <h3 className="section-title">Leaders</h3>
        {stats.players.length === 0 ? (
          <p className="empty" style={{ padding: 12 }}>
            Claim a completed game to unlock leaders.
          </p>
        ) : (
          <div className="leader-list">
            <LeaderRow label="Most wins" leader={leaders.mostWins} />
            <LeaderRow label="Highest avg score" leader={leaders.highestAvg} />
            <LeaderRow label="Best single game" leader={leaders.bestSingleGame} />
            <LeaderRow label="Worst single game" leader={leaders.worstSingleGame} />
            <LeaderRow label="Best bid %" leader={leaders.bestBidAccuracy} />
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
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [page, setPage] = useState(1);
  const filtered = useMemo(
    () => filterStatsGames(games, { name, from, to }),
    [games, name, from, to],
  );
  const paged = paginate(filtered, page, TABLE_PAGE_SIZE);
  const filtering = Boolean(name.trim() || from || to);

  useEffect(() => {
    setPage(1);
  }, [name, from, to]);

  if (games.length === 0) {
    return (
      <div className="card empty">No completed games yet.</div>
    );
  }

  return (
    <div className="stack">
      <div className="game-list-filters">
        <label className="field">
          Name
          <input
            type="search"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game, player, or winner"
            autoComplete="off"
          />
        </label>
        <div className="game-list-dates">
          <label className="field">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
            />
          </label>
          <label className="field">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
            />
          </label>
        </div>
        {filtering ? (
          <div className="game-list-filter-meta">
            <span className="muted">
              {filtered.length} of {games.length}
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setName('');
                setFrom('');
                setTo('');
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">No games match these filters.</div>
      ) : (
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
                {paged.items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link
                        to={`/games/${g.id}`}
                        state={{ from: 'stats' }}
                        className="table-link"
                      >
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
          <TablePager
            page={paged.page}
            pages={paged.pages}
            from={paged.from}
            to={paged.to}
            total={paged.total}
            onPage={setPage}
          />
        </div>
      )}
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
  const [name, setName] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => filterStatsPlayers(players, name), [players, name]);
  const paged = paginate(filtered, page, TABLE_PAGE_SIZE);
  const filtering = Boolean(name.trim());

  useEffect(() => {
    setPage(1);
  }, [name]);

  if (players.length === 0) {
    return (
      <div className="card empty">
        No registered players yet. Claim a seat on a completed game.
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="game-list-filters">
        <label className="field">
          Name
          <input
            type="search"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            autoComplete="off"
          />
        </label>
        {filtering ? (
          <div className="game-list-filter-meta">
            <span className="muted">
              {filtered.length} of {players.length}
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setName('')}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">No players match these filters.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Games</th>
                  <th>Wins</th>
                  <th>Avg</th>
                  <th>Bids</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((p) => (
                  <tr key={p.key ?? p.name}>
                    <td>
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => onSelect(p.key ?? p.name)}
                      >
                        <span className="table-primary">{p.name}</span>
                        <span className="table-secondary">
                          {p.gamesCompleted} finished
                        </span>
                      </button>
                    </td>
                    <td>{p.gamesPlayed}</td>
                    <td>{p.wins}</td>
                    <td>{fmt(p.avgScore)}</td>
                    <td>{pct(p.bidAccuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            page={paged.page}
            pages={paged.pages}
            from={paged.from}
            to={paged.to}
            total={paged.total}
            onPage={setPage}
          />
        </div>
      )}
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

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

function TopPlayers({
  players,
  games,
}: {
  players: StatsPlayer[];
  games: StatsGame[];
}) {
  const [range, setRange] = useState<TopRange>('all');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [calOpen, setCalOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [calError, setCalError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const top = useMemo(() => {
    const pool = custom
      ? playersForWindow(
          players,
          games,
          dayStartMs(custom.from),
          dayEndMs(custom.to),
        )
      : playersForRange(players, games, range);
    return rankBestPlayers(pool, 10);
  }, [players, games, range, custom]);

  useEffect(() => {
    setExpanded(false);
  }, [range, custom]);

  function openCalendar() {
    setDraftFrom(custom?.from ?? '');
    setDraftTo(custom?.to ?? '');
    setCalError(null);
    setCalOpen(true);
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      setCalError('Choose a start and end date');
      return;
    }
    if (draftFrom > draftTo) {
      setCalError('Start date must be on or before end date');
      return;
    }
    setCustom({ from: draftFrom, to: draftTo });
    setCalOpen(false);
    setCalError(null);
  }

  return (
    <section className="card">
      <div className="top-player-head">
        <h3 className="section-title section-title-plain">Top players</h3>
        <div className="top-player-tools">
          <select
            className="top-player-range"
            value={custom ? 'custom' : range}
            aria-label="Time range"
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') return;
              setCustom(null);
              setRange(v as TopRange);
            }}
          >
            <option value="all">All time</option>
            <option value="5y">Last 5 years</option>
            <option value="1y">Last year</option>
            <option value="6m">Last 6 months</option>
            <option value="1m">Last month</option>
            {custom ? <option value="custom">Custom</option> : null}
          </select>
          <button
            type="button"
            className={`icon-btn${custom ? ' is-on' : ''}`}
            aria-label="Custom date range"
            aria-pressed={custom != null}
            onClick={openCalendar}
          >
            <CalendarIcon />
          </button>
        </div>
      </div>
      {calOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setCalOpen(false);
            setCalError(null);
          }}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <p className="section-title" style={{ margin: 0 }}>
              Date range
            </p>
            {calError ? (
              <div className="banner banner-inline">{calError}</div>
            ) : null}
            <div className="game-list-dates">
              <label className="field">
                From
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo || undefined}
                  onChange={(e) => {
                    setDraftFrom(e.target.value);
                    setCalError(null);
                  }}
                />
              </label>
              <label className="field">
                To
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  onChange={(e) => {
                    setDraftTo(e.target.value);
                    setCalError(null);
                  }}
                />
              </label>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setCalOpen(false);
                  setCalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ flex: 1 }}
                onClick={applyCustom}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {top.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No games in this range.
        </p>
      ) : (
        <div className="top-player-list">
          {(expanded ? top : top.slice(0, 3)).map((row, i) => {
            const p = row.player;
            const placeClass =
              i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            return (
              <div key={p.key ?? p.name} className="top-player-row">
                <span className={`place ${placeClass}`.trim()}>{i + 1}</span>
                <div className="min-w-0">
                  <p className="top-player-name truncate">{p.name}</p>
                  <p className="top-player-meta truncate">
                    {p.gamesCompleted} game{p.gamesCompleted === 1 ? '' : 's'}
                    {p.winRate != null ? ` · ${p.winRate}% wins` : ''}
                    {p.avgScore != null ? ` · ${fmt(p.avgScore)} avg` : ''}
                    {p.bidAccuracy != null ? ` · ${p.bidAccuracy}% bids` : ''}
                  </p>
                </div>
                <span className="top-player-rating">{row.rating}</span>
              </div>
            );
          })}
        </div>
      )}
      {top.length > 3 && (
        <button
          type="button"
          className="btn ghost sm top-player-expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show top 3' : 'Show top 10'}
        </button>
      )}
    </section>
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

function TablePager({
  page,
  pages,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="table-pager">
      <button
        type="button"
        className="btn sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Prev
      </button>
      <span className="muted">
        {from}–{to} of {total}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
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
