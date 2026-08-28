import { GAME_EXPORT_HEADER, type GameExportRow } from './exportGameCsv';
import {
  HAND_SIZES,
  type ImportDraft,
  type ImportPlayer,
  type ImportRound,
  emptyRounds,
  validateImportDraft,
} from './importDraft';
import { createGameNote } from './offline/notes';
import { newId } from './offline/rules';

const HEADER = GAME_EXPORT_HEADER;

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagTexts(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(xmlUnescape(m[1]!.trim()));
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function asInt(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`${label} must be an integer`);
  }
  return n;
}

function parseForceFlag(raw: string, label: string): boolean {
  const n = raw.trim().toLowerCase();
  if (n === 'yes' || n === 'true') return true;
  if (n === 'no' || n === 'false' || n === '') return false;
  throw new Error(`${label} must be Yes or No`);
}

function rowFromCells(
  cells: string[],
  header: string[],
): Omit<GameExportRow, 'gameNumber'> & { gameNumber: number } {
  const get = (name: string): string => {
    const idx = header.indexOf(name);
    if (idx < 0) throw new Error(`Missing column ${name}`);
    return cells[idx] ?? '';
  };
  const flag = get('Forced Burn Flag');
  const status = get('Hand Status').trim();
  if (status !== 'Made Bid' && status !== 'Burn') {
    throw new Error('Hand Status must be Made Bid or Burn');
  }
  return {
    gameNumber: asInt(get('Game Number'), 'Game Number'),
    gameDate: get('Game Date').trim(),
    playerName: get('Player Name').trim(),
    playerPosition: asInt(get('Player Position'), 'Player Position'),
    handNumber: asInt(get('Hand Number'), 'Hand Number'),
    cardsDealt: asInt(get('Cards Dealt'), 'Cards Dealt'),
    tricksBid: asInt(get('Tricks Bid'), 'Tricks Bid'),
    tricksTaken: asInt(get('Tricks Taken'), 'Tricks Taken'),
    forcedBurnFlag: flag.trim() === 'Yes' ? 'Yes' : parseForceFlag(flag, 'Forced Burn Flag') ? 'Yes' : 'No',
    handStatus: status,
    handScore: asInt(get('Hand Score'), 'Hand Score'),
  };
}

function draftFromRows(
  rows: GameExportRow[],
  extra: { name?: string | null; notes?: string[]; gameDate?: string | null },
): ImportDraft {
  if (rows.length === 0) {
    throw new Error('Export has no completed hands');
  }
  const bySeat = new Map<number, string>();
  for (const row of rows) {
    if (!row.playerName) throw new Error('Player Name cannot be empty');
    const seat = row.playerPosition - 1;
    const existing = bySeat.get(seat);
    if (existing && existing.toLowerCase() !== row.playerName.toLowerCase()) {
      throw new Error(`Position ${row.playerPosition} has conflicting names`);
    }
    bySeat.set(seat, existing ?? row.playerName);
  }
  const players: ImportPlayer[] = [...bySeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seatIndex, name]) => ({
      id: newId(),
      name,
      seatIndex,
    }));

  const roundMap = new Map<number, ImportRound>();
  for (const row of rows) {
    const expected = HAND_SIZES[row.handNumber - 1];
    if (expected === undefined) {
      throw new Error(`Invalid hand number ${row.handNumber}`);
    }
    if (row.cardsDealt !== expected) {
      throw new Error(
        `Hand ${row.handNumber}: cards dealt ${row.cardsDealt} does not match ${expected}`,
      );
    }
    let round = roundMap.get(row.handNumber);
    const forceBurn = row.forcedBurnFlag === 'Yes';
    if (!round) {
      round = {
        number: row.handNumber,
        handSize: expected,
        forceBurn,
        entries: players.map((p) => ({
          playerId: p.id,
          bid: null,
          tricksTaken: null,
        })),
      };
      roundMap.set(row.handNumber, round);
    } else if (round.forceBurn !== forceBurn) {
      throw new Error(`Hand ${row.handNumber} has conflicting force-burn flags`);
    }
    const player = players.find((p) => p.seatIndex === row.playerPosition - 1);
    if (!player) {
      throw new Error(`Unknown position ${row.playerPosition}`);
    }
    const entry = round.entries.find((e) => e.playerId === player.id);
    if (!entry) {
      throw new Error(`Missing entry for ${player.name}`);
    }
    if (entry.bid !== null || entry.tricksTaken !== null) {
      throw new Error(
        `Hand ${row.handNumber} has two rows for ${player.name}`,
      );
    }
    entry.bid = row.tricksBid;
    entry.tricksTaken = row.tricksTaken;
  }

  const rounds = emptyRounds(players).map((blank) => {
    return roundMap.get(blank.number) ?? blank;
  });

  const gameDate =
    extra.gameDate ??
    rows.find((r) => r.gameDate)?.gameDate ??
    null;

  const draft: ImportDraft = {
    name: extra.name ?? null,
    gameDate: gameDate && /^\d{4}-\d{2}-\d{2}$/.test(gameDate) ? gameDate : null,
    aiImport: false,
    notes: (extra.notes ?? []).map((t) => createGameNote(t)),
    players,
    rounds,
  };
  return draft;
}

export function parseExportCsv(text: string): ImportDraft {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV is empty');
  }
  const header = parseCsvLine(lines[0]!);
  for (const col of HEADER) {
    if (!header.includes(col)) {
      throw new Error(`CSV is missing column ${col}`);
    }
  }
  const rows = lines.slice(1).map((line) => rowFromCells(parseCsvLine(line), header));
  const draft = draftFromRows(rows, {});
  const errors = validateImportDraft(draft);
  if (errors.length) {
    throw new Error(errors[0]);
  }
  return draft;
}

function noteStringsFromUnknown(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('notes must be an array');
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const t = item.trim();
      if (t) out.push(t);
      continue;
    }
    if (isRecord(item) && typeof item.text === 'string') {
      const t = item.text.trim();
      if (t) out.push(t);
      continue;
    }
    throw new Error('Each note must be a string or { text }');
  }
  return out;
}

function rowFromUnknown(value: unknown, index: number): GameExportRow {
  if (!isRecord(value)) {
    throw new Error(`rows[${index}] must be an object`);
  }
  const str = (a: string, b: string): string => {
    const v = value[a] ?? value[b];
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    throw new Error(`rows[${index}].${a} is required`);
  };
  const num = (a: string, b: string): number => {
    const v = value[a] ?? value[b];
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    if (typeof v === 'string' && Number.isInteger(Number(v))) return Number(v);
    throw new Error(`rows[${index}].${a} must be an integer`);
  };
  const flagRaw = str('forcedBurnFlag', 'Forced Burn Flag');
  const status = str('handStatus', 'Hand Status').trim();
  if (status !== 'Made Bid' && status !== 'Burn') {
    throw new Error(`rows[${index}].handStatus must be Made Bid or Burn`);
  }
  return {
    gameNumber: num('gameNumber', 'Game Number'),
    gameDate: str('gameDate', 'Game Date').trim(),
    playerName: str('playerName', 'Player Name').trim(),
    playerPosition: num('playerPosition', 'Player Position'),
    handNumber: num('handNumber', 'Hand Number'),
    cardsDealt: num('cardsDealt', 'Cards Dealt'),
    tricksBid: num('tricksBid', 'Tricks Bid'),
    tricksTaken: num('tricksTaken', 'Tricks Taken'),
    forcedBurnFlag: parseForceFlag(flagRaw, `rows[${index}].forcedBurnFlag`)
      ? 'Yes'
      : 'No',
    handStatus: status,
    handScore: num('handScore', 'Hand Score'),
  };
}

export function parseExportJson(text: string): ImportDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (!isRecord(raw)) {
    throw new Error('JSON must be an object');
  }
  if (Array.isArray(raw.rows)) {
    const rows = raw.rows.map(rowFromUnknown);
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const draft = draftFromRows(rows, {
      name: name || null,
      notes: noteStringsFromUnknown(raw.notes),
      gameDate: typeof raw.gameDate === 'string' ? raw.gameDate : null,
    });
    const errors = validateImportDraft(draft);
    if (errors.length) throw new Error(errors[0]);
    return draft;
  }
  throw new Error('JSON must include a rows array matching the export');
}

export function parseExportXml(text: string): ImportDraft {
  const trimmed = text.trim();
  if (!/<ohHeckExport[\s>]/i.test(trimmed)) {
    throw new Error('XML root must be <ohHeckExport>');
  }
  const name = tagTexts(trimmed, 'name')[0]?.trim() || null;
  const notes = tagTexts(trimmed, 'note');
  const rowBlocks = tagTexts(trimmed, 'row');
  if (rowBlocks.length === 0) {
    throw new Error('XML has no <row> entries');
  }
  const rows: GameExportRow[] = rowBlocks.map((block, index) => {
    const cell = (tag: string): string => {
      const v = tagTexts(block, tag)[0];
      if (v === undefined) {
        throw new Error(`rows[${index}] missing <${tag}>`);
      }
      return v;
    };
    const status = cell('HandStatus');
    if (status !== 'Made Bid' && status !== 'Burn') {
      throw new Error(`rows[${index}] HandStatus must be Made Bid or Burn`);
    }
    return {
      gameNumber: asInt(cell('GameNumber'), 'GameNumber'),
      gameDate: cell('GameDate'),
      playerName: cell('PlayerName'),
      playerPosition: asInt(cell('PlayerPosition'), 'PlayerPosition'),
      handNumber: asInt(cell('HandNumber'), 'HandNumber'),
      cardsDealt: asInt(cell('CardsDealt'), 'CardsDealt'),
      tricksBid: asInt(cell('TricksBid'), 'TricksBid'),
      tricksTaken: asInt(cell('TricksTaken'), 'TricksTaken'),
      forcedBurnFlag: parseForceFlag(cell('ForcedBurnFlag'), 'ForcedBurnFlag')
        ? 'Yes'
        : 'No',
      handStatus: status,
      handScore: asInt(cell('HandScore'), 'HandScore'),
    };
  });
  const draft = draftFromRows(rows, { name, notes });
  const errors = validateImportDraft(draft);
  if (errors.length) throw new Error(errors[0]);
  return draft;
}

export function parseExportFile(filename: string, text: string): ImportDraft {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return parseExportCsv(text);
  if (lower.endsWith('.json')) return parseExportJson(text);
  if (lower.endsWith('.xml')) return parseExportXml(text);
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return parseExportJson(text);
  if (trimmed.startsWith('<')) return parseExportXml(text);
  if (trimmed.includes('Player Name')) return parseExportCsv(text);
  throw new Error('Upload a .xml, .json, or .csv export');
}
