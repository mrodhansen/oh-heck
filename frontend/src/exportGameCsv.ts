import type { GameDetail } from './api';

const HEADER = [
  'Game Number',
  'Game Date',
  'Player Name',
  'Player Position',
  'Hand Number',
  'Cards Dealt',
  'Tricks Bid',
  'Tricks Taken',
  'Forced Burn Flag',
  'Hand Status',
  'Hand Score',
] as const;

/** Local calendar day (YYYY-MM-DD). */
function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function gameExportDate(game: GameDetail): string {
  const iso = game.finishedAt ?? game.startedAt ?? game.createdAt;
  return localDateKey(iso) || localDateKey(new Date().toISOString());
}

export function gameExportFilename(
  game: GameDetail,
  gameNumber = 1,
): string {
  return `oh-heck-${gameExportDate(game)}-game-${gameNumber}.csv`;
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build CSV matching the oh-heck score-sheet export format. */
export function buildGameExportCsv(
  game: GameDetail,
  gameNumber = 1,
): string {
  const date = gameExportDate(game);
  const players = [...game.players].sort((a, b) => a.seatIndex - b.seatIndex);
  const rounds = [...game.rounds].sort((a, b) => a.number - b.number);

  const lines: string[] = [HEADER.join(',')];

  for (const player of players) {
    for (const round of rounds) {
      const entry = round.entries.find((e) => e.playerId === player.id);
      if (
        !entry ||
        entry.bid === null ||
        entry.tricksTaken === null ||
        entry.points === null
      ) {
        continue;
      }

      const made =
        entry.made !== null && entry.made !== undefined
          ? entry.made
          : entry.bid === entry.tricksTaken;

      lines.push(
        [
          gameNumber,
          date,
          csvCell(player.name),
          player.seatIndex + 1,
          round.number,
          round.handSize,
          entry.bid,
          entry.tricksTaken,
          round.forceBurn ? 'Yes' : 'No',
          made ? 'Made Bid' : 'Burn',
          entry.points,
        ].join(','),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function downloadGameCsv(game: GameDetail, gameNumber = 1): void {
  const csv = buildGameExportCsv(game, gameNumber);
  const filename = gameExportFilename(game, gameNumber);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
