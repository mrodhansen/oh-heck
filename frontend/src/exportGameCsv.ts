import type { GameDetail, GameNote } from './api';

export const GAME_EXPORT_HEADER = [
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

export type GameExportRow = {
  gameNumber: number;
  gameDate: string;
  playerName: string;
  playerPosition: number;
  handNumber: number;
  cardsDealt: number;
  tricksBid: number;
  tricksTaken: number;
  forcedBurnFlag: 'Yes' | 'No';
  handStatus: 'Made Bid' | 'Burn';
  handScore: number;
};

export type GameExportDoc = {
  format: 'oh-heck-export';
  version: 1;
  gameNumber: number;
  gameDate: string;
  name: string | null;
  notes: { text: string }[];
  rows: GameExportRow[];
};

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
  ext: 'csv' | 'xml' | 'json' = 'csv',
): string {
  return `oh-heck-${gameExportDate(game)}-game-${gameNumber}.${ext}`;
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function noteTexts(notes: GameNote[] | undefined): { text: string }[] {
  return (notes ?? [])
    .map((n) => ({ text: n.text.trim() }))
    .filter((n) => n.text.length > 0);
}

export function buildGameExportRows(
  game: GameDetail,
  gameNumber = 1,
): GameExportRow[] {
  const date = gameExportDate(game);
  const players = [...game.players].sort((a, b) => a.seatIndex - b.seatIndex);
  const rounds = [...game.rounds].sort((a, b) => a.number - b.number);
  const rows: GameExportRow[] = [];

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

      rows.push({
        gameNumber,
        gameDate: date,
        playerName: player.name,
        playerPosition: player.seatIndex + 1,
        handNumber: round.number,
        cardsDealt: round.handSize,
        tricksBid: entry.bid,
        tricksTaken: entry.tricksTaken,
        forcedBurnFlag: round.forceBurn ? 'Yes' : 'No',
        handStatus: made ? 'Made Bid' : 'Burn',
        handScore: entry.points,
      });
    }
  }

  return rows;
}

export function buildGameExportDoc(
  game: GameDetail,
  gameNumber = 1,
): GameExportDoc {
  return {
    format: 'oh-heck-export',
    version: 1,
    gameNumber,
    gameDate: gameExportDate(game),
    name: game.name,
    notes: noteTexts(game.notes),
    rows: buildGameExportRows(game, gameNumber),
  };
}

/** Build CSV matching the oh-heck score-sheet export format. */
export function buildGameExportCsv(
  game: GameDetail,
  gameNumber = 1,
): string {
  const lines: string[] = [GAME_EXPORT_HEADER.join(',')];
  for (const row of buildGameExportRows(game, gameNumber)) {
    lines.push(
      [
        row.gameNumber,
        row.gameDate,
        csvCell(row.playerName),
        row.playerPosition,
        row.handNumber,
        row.cardsDealt,
        row.tricksBid,
        row.tricksTaken,
        row.forcedBurnFlag,
        row.handStatus,
        row.handScore,
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function buildGameExportXml(
  game: GameDetail,
  gameNumber = 1,
): string {
  const doc = buildGameExportDoc(game, gameNumber);
  const notes = doc.notes
    .map((n) => `    <note>${xmlEscape(n.text)}</note>`)
    .join('\n');
  const rows = doc.rows
    .map((row) => {
      return [
        '  <row>',
        `    <GameNumber>${xmlEscape(row.gameNumber)}</GameNumber>`,
        `    <GameDate>${xmlEscape(row.gameDate)}</GameDate>`,
        `    <PlayerName>${xmlEscape(row.playerName)}</PlayerName>`,
        `    <PlayerPosition>${xmlEscape(row.playerPosition)}</PlayerPosition>`,
        `    <HandNumber>${xmlEscape(row.handNumber)}</HandNumber>`,
        `    <CardsDealt>${xmlEscape(row.cardsDealt)}</CardsDealt>`,
        `    <TricksBid>${xmlEscape(row.tricksBid)}</TricksBid>`,
        `    <TricksTaken>${xmlEscape(row.tricksTaken)}</TricksTaken>`,
        `    <ForcedBurnFlag>${xmlEscape(row.forcedBurnFlag)}</ForcedBurnFlag>`,
        `    <HandStatus>${xmlEscape(row.handStatus)}</HandStatus>`,
        `    <HandScore>${xmlEscape(row.handScore)}</HandScore>`,
        '  </row>',
      ].join('\n');
    })
    .join('\n');
  const nameXml = doc.name
    ? `  <name>${xmlEscape(doc.name)}</name>\n`
    : '';
  const notesXml = notes ? `  <notes>\n${notes}\n  </notes>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ohHeckExport format="oh-heck-export" version="1">\n${nameXml}${notesXml}${rows}\n</ohHeckExport>\n`;
}

export function buildGameExportJson(
  game: GameDetail,
  gameNumber = 1,
): string {
  return `${JSON.stringify(buildGameExportDoc(game, gameNumber), null, 2)}\n`;
}

function downloadBlob(contents: string, filename: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
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

export function downloadGameCsv(game: GameDetail, gameNumber = 1): void {
  downloadBlob(
    buildGameExportCsv(game, gameNumber),
    gameExportFilename(game, gameNumber, 'csv'),
    'text/csv;charset=utf-8',
  );
}

export function downloadGameXml(game: GameDetail, gameNumber = 1): void {
  downloadBlob(
    buildGameExportXml(game, gameNumber),
    gameExportFilename(game, gameNumber, 'xml'),
    'application/xml;charset=utf-8',
  );
}

export function downloadGameJson(game: GameDetail, gameNumber = 1): void {
  downloadBlob(
    buildGameExportJson(game, gameNumber),
    gameExportFilename(game, gameNumber, 'json'),
    'application/json;charset=utf-8',
  );
}
