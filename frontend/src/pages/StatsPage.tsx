import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, StatsGame, StatsPlayer, StatsResponse, StatsLeader } from '../api';
import { toUserMessage } from '../api/errors';
import { filterStatsGames } from './statsGamesFilter';
import { filterStatsPlayers } from './statsPlayersFilter';
import { paginate } from './statsPaginate';
import { statsView } from './statsView';
import {
  dayEndMs,
  dayStartMs,
  playersForRange,
  playersForWindow,
  rankBestPlayers,
  type LastNGames,
  type TopRange,
} from './bestPlayers';
import {
  banner,
  btnClass,
  card,
  cn,
  empty,
  field,
  fillCenter,
  gameTabClass,
  gameTabs,
  hint,
  iconBtn,
  modal,
  modalBackdrop,
  muted,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  place,
  placeTone,
  row,
  sectionTitle,
  sectionTitlePlain,
  stack,
  stackSm,
  statsGrid,
  statTile,
} from '../ui';

const TABLE_PAGE_SIZE = 20;

const dataTable = 'w-max min-w-full border-collapse text-hint tablet:w-full';
const dataTh =
  'whitespace-nowrap border-b border-line bg-surface p-2.5 text-left align-top text-kicker font-semibold uppercase tracking-wide text-muted';
const dataTd =
  'whitespace-nowrap border-b border-line bg-surface p-2.5 text-left align-top';
const tableLink = 'flex flex-col gap-0.5 text-inherit active:opacity-75';
const tablePrimary =
  'max-w-36 truncate font-semibold text-grey-900 tablet:max-w-none';
const tableSecondary = 'text-kicker text-muted';

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
  const [showAllPlayers, setShowAllPlayers] = useState(false);

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

  if (loading) return <div className={cn(empty, fillCenter)}>Loading stats…</div>;
  if (error) return <div className={banner}>{error}</div>;
  if (!stats) return <div className={empty}>Stats unavailable.</div>;

  const view = statsView(stats, showAllPlayers);
  const player =
    selectedPlayer != null
      ? view.players.find((p) => playerKey(p) === selectedPlayer) ?? null
      : null;

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={cn(pageHeader, 'items-center')}>
          <h2 className={pageTitle}>Stats</h2>
          <button
            type="button"
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent p-0 text-hint font-medium',
              showAllPlayers ? 'text-grey-900' : muted,
            )}
            role="switch"
            aria-checked={showAllPlayers}
            onClick={() => {
              setShowAllPlayers((v) => !v);
              setSelectedPlayer(null);
            }}
          >
            Show All Players
            <span
              className={cn(
                'relative h-switch w-9 shrink-0 overflow-hidden rounded-full border',
                showAllPlayers
                  ? 'border-grey-800 bg-grey-800'
                  : 'border-line-strong bg-sand-200',
              )}
              aria-hidden
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-surface',
                  showAllPlayers ? 'left-4' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </div>
        <div className={cn(gameTabs, 'mt-2.5')} role="tablist">
          <button
            type="button"
            className={gameTabClass(tab === 'overview')}
            onClick={() => {
              setTab('overview');
              setSelectedPlayer(null);
            }}
          >
            Overview
          </button>
          <button
            type="button"
            className={gameTabClass(tab === 'games')}
            onClick={() => {
              setTab('games');
              setSelectedPlayer(null);
            }}
          >
            Games
          </button>
          <button
            type="button"
            className={gameTabClass(tab === 'players')}
            onClick={() => setTab('players')}
          >
            Players
          </button>
        </div>
      </div>

      <div className={cn(pageFitBody, stack)}>
        {tab === 'overview' && (
          <OverviewPanel stats={view} showAllPlayers={showAllPlayers} />
        )}
        {tab === 'games' && <GamesPanel games={view.games} />}
        {tab === 'players' && !player && (
          <PlayersList
            players={view.players}
            showAllPlayers={showAllPlayers}
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

function OverviewPanel({
  stats,
  showAllPlayers,
}: {
  stats: StatsResponse;
  showAllPlayers: boolean;
}) {
  const { overview, leaders } = {
    overview: stats.overview,
    leaders: stats.overview.leaders,
  };

  return (
    <>
      <div className={statsGrid}>
        <Metric label="Completed games" value={overview.completedGames} />
        <Metric label="Players" value={overview.uniquePlayers} />
        <Metric label="Rounds logged" value={overview.totalRoundsPlayed} />
        <Metric label="Force burns" value={overview.totalForceBurns} />
      </div>

      <TopPlayers players={stats.players} games={stats.games} />

      <section className={card}>
        <h3 className={sectionTitle}>Leaders</h3>
        {stats.players.length === 0 ? (
          <p className="p-3 text-center text-btn text-muted">
            {showAllPlayers
              ? 'No player stats yet.'
              : 'Claim a completed game to unlock leaders.'}
          </p>
        ) : (
          <div className="flex flex-col">
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
      <div className={cn(card, empty)}>No completed games yet.</div>
    );
  }

  return (
    <div className={stack}>
      <div className={stackSm}>
        <label className={field}>
          Name
          <input
            type="search"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game, player, or winner"
            autoComplete="off"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
            />
          </label>
          <label className={field}>
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
          <div className="flex items-center justify-between gap-2">
            <span className={muted}>
              {filtered.length} of {games.length}
            </span>
            <button
              type="button"
              className={btnClass({ kind: 'ghost', size: 'sm' })}
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
        <div className={cn(card, empty)}>No games match these filters.</div>
      ) : (
        <div className={cn(card, 'overflow-hidden p-0')}>
          <div className="table-scroll">
            <table className={dataTable}>
              <thead>
                <tr>
                  <th className={dataTh}>Game</th>
                  <th className={dataTh}>Players</th>
                  <th className={dataTh}>Winner</th>
                  <th className={dataTh}>High</th>
                  <th className={dataTh}>Low</th>
                  <th className={dataTh}>FB</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((g) => (
                  <tr key={g.id} className="last:[&>td]:border-b-0">
                    <td className={dataTd}>
                      <Link
                        to={`/games/${g.id}`}
                        state={{ from: 'stats' }}
                        className={tableLink}
                      >
                        <span className={tablePrimary}>
                          {g.name ?? 'Untitled'}
                        </span>
                        <span className={tableSecondary}>
                          {formatDate(g.finishedAt ?? g.createdAt)}
                          {g.isHighTable ? ' · High table' : ''}
                        </span>
                      </Link>
                    </td>
                    <td className={dataTd}>{g.playerCount}</td>
                    <td className={dataTd}>
                      {g.winner ? (
                        <>
                          {g.winner}
                          {g.winnerScore != null ? (
                            <span className={muted}> ({g.winnerScore})</span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={dataTd}>{fmt(g.highScore)}</td>
                    <td className={dataTd}>{fmt(g.lowScore)}</td>
                    <td className={dataTd}>{g.forceBurns}</td>
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
  showAllPlayers,
  onSelect,
}: {
  players: StatsPlayer[];
  showAllPlayers: boolean;
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
      <div className={cn(card, empty)}>
        {showAllPlayers
          ? 'No players in completed games yet.'
          : 'No registered players yet. Claim a seat on a completed game.'}
      </div>
    );
  }

  return (
    <div className={stack}>
      <div className={stackSm}>
        <label className={field}>
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
          <div className="flex items-center justify-between gap-2">
            <span className={muted}>
              {filtered.length} of {players.length}
            </span>
            <button
              type="button"
              className={btnClass({ kind: 'ghost', size: 'sm' })}
              onClick={() => setName('')}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className={cn(card, empty)}>No players match these filters.</div>
      ) : (
        <div className={cn(card, 'overflow-hidden p-0')}>
          <div className="table-scroll">
            <table className={dataTable}>
              <thead>
                <tr>
                  <th className={dataTh}>Player</th>
                  <th className={dataTh}>Games</th>
                  <th className={dataTh}>Wins</th>
                  <th className={dataTh}>Avg</th>
                  <th className={dataTh}>Bids</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((p) => (
                  <tr key={p.key ?? p.name} className="last:[&>td]:border-b-0">
                    <td className={dataTd}>
                      <button
                        type="button"
                        className={cn(
                          tableLink,
                          'cursor-pointer appearance-none border-0 bg-transparent p-0 text-left',
                        )}
                        onClick={() => onSelect(p.key ?? p.name)}
                      >
                        <span className={tablePrimary}>{p.name}</span>
                        <span className={tableSecondary}>
                          {p.gamesCompleted} finished
                        </span>
                      </button>
                    </td>
                    <td className={dataTd}>{p.gamesPlayed}</td>
                    <td className={dataTd}>{p.wins}</td>
                    <td className={dataTd}>{fmt(p.avgScore)}</td>
                    <td className={dataTd}>{pct(p.bidAccuracy)}</td>
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
    <div className={stack}>
      <button
        type="button"
        className={cn(btnClass({ kind: 'ghost', size: 'sm' }), 'self-start pl-0')}
        onClick={onBack}
      >
        ← Players
      </button>
      <div className={cn(row, 'justify-between')}>
        <h3 className={cn(pageTitle, 'text-md')}>
          {player.name}
        </h3>
        <span className="shrink-0 text-hint text-ok">
          {player.wins} win{player.wins === 1 ? '' : 's'}
        </span>
      </div>
      <div className={statsGrid}>
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
  const [lastN, setLastN] = useState<LastNGames>('all');
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
          new Date(),
          lastN,
        )
      : playersForRange(players, games, range, new Date(), lastN);
    return rankBestPlayers(pool, 10);
  }, [players, games, range, custom, lastN]);

  useEffect(() => {
    setExpanded(false);
  }, [range, custom, lastN]);

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
    <section className={card}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className={cn(sectionTitle, sectionTitlePlain)}>Top players</h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <select
            className="h-9 shrink-0 rounded-btn border border-line-strong bg-surface px-2 text-meta text-ink"
            value={lastN === 'all' ? 'all' : String(lastN)}
            aria-label="Based on"
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'all') {
                setLastN('all');
                return;
              }
              if (v === '5' || v === '10' || v === '20') {
                setLastN(Number(v));
                return;
              }
              throw new Error(`Invalid last-N value: ${v}`);
            }}
          >
            <option value="all">All games</option>
            <option value="5">Last 5</option>
            <option value="10">Last 10</option>
            <option value="20">Last 20</option>
          </select>
          <select
            className="h-9 shrink-0 rounded-btn border border-line-strong bg-surface px-2 text-meta text-ink"
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
            className={cn(
              iconBtn,
              'h-9 w-9',
              custom && 'border-grey-800 bg-sand-100',
            )}
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
          className={modalBackdrop}
          onClick={() => {
            setCalOpen(false);
            setCalError(null);
          }}
        >
          <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
            <p className={cn(sectionTitle, 'm-0')}>
              Date range
            </p>
            {calError ? (
              <div className={cn(banner, 'shrink-0')}>{calError}</div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className={field}>
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
              <label className={field}>
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
            <div className={cn(row, 'gap-2')}>
              <button
                type="button"
                className={btnClass({ kind: 'ghost' })}
                onClick={() => {
                  setCalOpen(false);
                  setCalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(btnClass({ kind: 'primary' }), 'flex-1')}
                onClick={applyCustom}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {top.length === 0 ? (
        <p className={cn(muted, 'm-0')}>
          No games in this range.
        </p>
      ) : (
        <div className="flex flex-col">
          {(expanded ? top : top.slice(0, 3)).map((row, i) => {
            const p = row.player;
            return (
              <div
                key={p.key ?? p.name}
                className="flex min-w-0 items-center gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0"
              >
                <span className={cn(place, placeTone(i + 1))}>{i + 1}</span>
                <div className="min-w-0">
                  <p className="m-0 truncate font-650 text-grey-900">{p.name}</p>
                  <p className={cn(hint, 'mt-0.5 mb-0 truncate')}>
                    {p.gamesCompleted} game{p.gamesCompleted === 1 ? '' : 's'}
                    {p.winRate != null ? ` · ${p.winRate}% wins` : ''}
                    {p.avgScore != null ? ` · ${fmt(p.avgScore)} avg` : ''}
                    {p.bidAccuracy != null ? ` · ${p.bidAccuracy}% bids` : ''}
                  </p>
                </div>
                <span className="ml-auto shrink-0 text-xl font-650 leading-snug tabular-nums text-grey-900">
                  {row.rating}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {top.length > 3 && (
        <button
          type="button"
          className={cn(btnClass({ kind: 'ghost', size: 'sm' }), 'mt-2 w-full')}
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
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className={cn(muted, 'shrink-0 text-lede')}>{label}</span>
      {leader ? (
        <span className="min-w-0 text-right text-btn">
          <strong className="font-650 text-grey-900">{leader.name}</strong>
          <span className={muted}> · {leader.value}</span>
        </span>
      ) : (
        <span className={muted}>—</span>
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
    <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2.5">
      <button
        type="button"
        className={btnClass({ size: 'sm' })}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Prev
      </button>
      <span className={muted}>
        {from}–{to} of {total}
      </span>
      <button
        type="button"
        className={btnClass({ size: 'sm' })}
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
    <div className={statTile}>
      <div className="text-kicker uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-md font-650 tabular-nums text-grey-900">
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
