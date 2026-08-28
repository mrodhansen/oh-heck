import { BadRequestException } from '@nestjs/common';

export const IMPORT_ROUND_COUNT = 13;
export const IMPORT_HAND_SIZES = [
  7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7,
] as const;

export type ImportDraftPlayer = {
  name: string;
  seatIndex: number;
};

export type ImportDraftEntry = {
  seatIndex: number;
  bid: number;
  tricksTaken: number;
};

export type ImportDraftRound = {
  number: number;
  forceBurn: boolean;
  entries: ImportDraftEntry[];
};

export type ImportDraft = {
  name: string | null;
  gameDate: string | null;
  players: ImportDraftPlayer[];
  rounds: ImportDraftRound[];
  noteTexts: string[];
};

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedName(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} must be a string`);
  }
  const name = value.trim();
  if (!name) {
    throw new BadRequestException(`${label} cannot be empty`);
  }
  if (name.length > 40) {
    throw new BadRequestException(`${label} must be 40 characters or fewer`);
  }
  return name;
}

function asInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(`${label} must be an integer`);
  }
  return value;
}

function asBool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${label} must be a boolean`);
  }
  return value;
}

export function assertImportDraft(draft: {
  players: ImportDraftPlayer[];
  rounds: ImportDraftRound[];
}): void {
  const playerCount = draft.players.length;
  if (playerCount < 2 || playerCount > 7) {
    throw new BadRequestException('Need 2–7 players');
  }
  const seats = new Set<number>();
  const names = new Set<string>();
  for (const p of draft.players) {
    if (p.seatIndex < 0 || p.seatIndex >= playerCount) {
      throw new BadRequestException(
        `seatIndex ${p.seatIndex} is out of range for ${playerCount} players`,
      );
    }
    if (seats.has(p.seatIndex)) {
      throw new BadRequestException('Player seats must be unique');
    }
    seats.add(p.seatIndex);
    const key = p.name.trim().toLowerCase();
    if (names.has(key)) {
      throw new BadRequestException('Player names must be unique');
    }
    names.add(key);
  }
  if (seats.size !== playerCount) {
    throw new BadRequestException('Every seat 0..n-1 must have a player');
  }

  if (draft.rounds.length !== IMPORT_ROUND_COUNT) {
    throw new BadRequestException(
      `Import must include all ${IMPORT_ROUND_COUNT} rounds`,
    );
  }
  const seenRounds = new Set<number>();
  for (const round of draft.rounds) {
    if (seenRounds.has(round.number)) {
      throw new BadRequestException(`Duplicate round ${round.number}`);
    }
    seenRounds.add(round.number);
    if (round.number < 1 || round.number > IMPORT_ROUND_COUNT) {
      throw new BadRequestException(`Invalid round number ${round.number}`);
    }
    const handSize = IMPORT_HAND_SIZES[round.number - 1];
    if (handSize === undefined) {
      throw new BadRequestException(`Missing hand size for round ${round.number}`);
    }
    if (round.entries.length !== playerCount) {
      throw new BadRequestException(
        `Round ${round.number} must include every player`,
      );
    }
    const entrySeats = new Set<number>();
    let trickSum = 0;
    for (const e of round.entries) {
      if (e.seatIndex < 0 || e.seatIndex >= playerCount) {
        throw new BadRequestException(
          `Round ${round.number}: seatIndex ${e.seatIndex} is out of range`,
        );
      }
      if (entrySeats.has(e.seatIndex)) {
        throw new BadRequestException(
          `Round ${round.number}: duplicate seat ${e.seatIndex}`,
        );
      }
      entrySeats.add(e.seatIndex);
      if (e.bid < 0 || e.bid > handSize) {
        throw new BadRequestException(
          `Round ${round.number}: bid must be 0–${handSize}`,
        );
      }
      if (e.tricksTaken < 0 || e.tricksTaken > handSize) {
        throw new BadRequestException(
          `Round ${round.number}: tricks must be 0–${handSize}`,
        );
      }
      trickSum += e.tricksTaken;
    }
    if (entrySeats.size !== playerCount) {
      throw new BadRequestException(
        `Round ${round.number} is missing a player`,
      );
    }
    if (trickSum !== handSize) {
      throw new BadRequestException(
        `Round ${round.number}: tricks must sum to ${handSize} (got ${trickSum})`,
      );
    }
  }
  for (let n = 1; n <= IMPORT_ROUND_COUNT; n++) {
    if (!seenRounds.has(n)) {
      throw new BadRequestException(`Missing round ${n}`);
    }
  }
}

function parsePlayers(raw: unknown): ImportDraftPlayer[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException('players must be a non-empty array');
  }
  return raw.map((item, i) => {
    if (typeof item === 'string') {
      return { name: asTrimmedName(item, `players[${i}]`), seatIndex: i };
    }
    if (!isRecord(item)) {
      throw new BadRequestException(`players[${i}] must be an object`);
    }
    const name = asTrimmedName(
      item.name ?? item.playerName,
      `players[${i}].name`,
    );
    let seatIndex = i;
    if (item.seatIndex !== undefined) {
      seatIndex = asInt(item.seatIndex, `players[${i}].seatIndex`);
    } else if (item.position !== undefined || item.playerPosition !== undefined) {
      const pos = asInt(
        item.position ?? item.playerPosition,
        `players[${i}].position`,
      );
      seatIndex = pos - 1;
    }
    return { name, seatIndex };
  });
}

function parseEntries(
  raw: unknown,
  players: ImportDraftPlayer[],
  roundNumber: number,
): ImportDraftEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException(
      `Round ${roundNumber}: scores/entries must be a non-empty array`,
    );
  }
  const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));
  return raw.map((item, i) => {
    if (!isRecord(item)) {
      throw new BadRequestException(
        `Round ${roundNumber} entry ${i} must be an object`,
      );
    }
    let seatIndex: number;
    if (typeof item.seatIndex === 'number') {
      seatIndex = asInt(item.seatIndex, `Round ${roundNumber} entry ${i} seatIndex`);
    } else if (typeof item.playerName === 'string' || typeof item.name === 'string') {
      const name = asTrimmedName(
        item.playerName ?? item.name,
        `Round ${roundNumber} entry ${i} player`,
      );
      const player = byName.get(name.toLowerCase());
      if (!player) {
        throw new BadRequestException(
          `Round ${roundNumber}: unknown player "${name}"`,
        );
      }
      seatIndex = player.seatIndex;
    } else {
      throw new BadRequestException(
        `Round ${roundNumber} entry ${i} needs seatIndex or playerName`,
      );
    }
    const bid = asInt(
      item.bid ?? item.tricksBid,
      `Round ${roundNumber} entry ${i} bid`,
    );
    const tricksTaken = asInt(
      item.tricksTaken ?? item.tricks,
      `Round ${roundNumber} entry ${i} tricksTaken`,
    );
    return { seatIndex, bid, tricksTaken };
  });
}

function parseRounds(
  raw: unknown,
  players: ImportDraftPlayer[],
): ImportDraftRound[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException('rounds must be an array');
  }
  return raw.map((item, i) => {
    if (!isRecord(item)) {
      throw new BadRequestException(`rounds[${i}] must be an object`);
    }
    const number = asInt(
      item.number ?? item.handNumber,
      `rounds[${i}].number`,
    );
    const forceBurn = item.forceBurn === undefined
      ? false
      : asBool(item.forceBurn, `rounds[${i}].forceBurn`);
    const entries = parseEntries(
      item.entries ?? item.scores,
      players,
      number,
    );
    return { number, forceBurn, entries };
  });
}

function parseNoteTexts(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new BadRequestException('notes must be an array');
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push(text);
      continue;
    }
    if (isRecord(item) && typeof item.text === 'string') {
      const text = item.text.trim();
      if (text) out.push(text);
      continue;
    }
    throw new BadRequestException('Each note must be a string or { text }');
  }
  return out;
}

function parseGameDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException('gameDate must be YYYY-MM-DD');
  }
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestException('gameDate must be YYYY-MM-DD');
  }
  return s;
}

/**
 * Map LLM / file JSON into a draft.
 * Accepts `{ players, rounds }` or `{ rows: [...] }` export shape.
 * `requireComplete` (default true) enforces 13 legal rounds — turn off for photo OCR preview.
 */
export function parseUnknownImport(
  raw: unknown,
  opts?: { requireComplete?: boolean },
): ImportDraft {
  if (!isRecord(raw)) {
    throw new BadRequestException('Import payload must be an object');
  }
  if (Array.isArray(raw.rows)) {
    return parseRowImport(raw, opts);
  }
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const players = parsePlayers(raw.players);
  const rounds = parseRounds(raw.rounds, players);
  const draft: ImportDraft = {
    name,
    gameDate: parseGameDate(raw.gameDate ?? raw.date),
    players,
    rounds,
    noteTexts: parseNoteTexts(raw.notes),
  };
  if (opts?.requireComplete !== false) {
    assertImportDraft(draft);
  } else if (draft.players.length < 2 || draft.players.length > 7) {
    throw new BadRequestException('Need 2–7 players');
  }
  return draft;
}

type ExportRow = {
  playerName: string;
  playerPosition: number;
  handNumber: number;
  tricksBid: number;
  tricksTaken: number;
  forcedBurn: boolean;
};

function parseRow(value: unknown, index: number): ExportRow {
  if (!isRecord(value)) {
    throw new BadRequestException(`rows[${index}] must be an object`);
  }
  const playerName = asTrimmedName(
    value.playerName ?? value['Player Name'],
    `rows[${index}].playerName`,
  );
  const playerPosition = asInt(
    value.playerPosition ?? value['Player Position'],
    `rows[${index}].playerPosition`,
  );
  const handNumber = asInt(
    value.handNumber ?? value['Hand Number'],
    `rows[${index}].handNumber`,
  );
  const tricksBid = asInt(
    value.tricksBid ?? value['Tricks Bid'] ?? value.bid,
    `rows[${index}].tricksBid`,
  );
  const tricksTaken = asInt(
    value.tricksTaken ?? value['Tricks Taken'],
    `rows[${index}].tricksTaken`,
  );
  const flag = value.forcedBurnFlag ?? value['Forced Burn Flag'] ?? value.forceBurn;
  let forcedBurn = false;
  if (typeof flag === 'boolean') {
    forcedBurn = flag;
  } else if (typeof flag === 'string') {
    const n = flag.trim().toLowerCase();
    if (n === 'yes' || n === 'true') forcedBurn = true;
    else if (n === 'no' || n === 'false' || n === '') forcedBurn = false;
    else {
      throw new BadRequestException(
        `rows[${index}].forcedBurnFlag must be Yes or No`,
      );
    }
  } else if (flag != null) {
    throw new BadRequestException(
      `rows[${index}].forcedBurnFlag must be Yes or No`,
    );
  }
  if (playerPosition < 1 || playerPosition > 7) {
    throw new BadRequestException(
      `rows[${index}].playerPosition must be 1–7`,
    );
  }
  return {
    playerName,
    playerPosition,
    handNumber,
    tricksBid,
    tricksTaken,
    forcedBurn,
  };
}

function parseRowImport(
  raw: { [key: string]: unknown },
  opts?: { requireComplete?: boolean },
): ImportDraft {
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new BadRequestException('rows must be a non-empty array');
  }
  const rows = raw.rows.map(parseRow);
  const bySeat = new Map<number, string>();
  for (const row of rows) {
    const seat = row.playerPosition - 1;
    const existing = bySeat.get(seat);
    if (existing && existing.toLowerCase() !== row.playerName.toLowerCase()) {
      throw new BadRequestException(
        `Position ${row.playerPosition} has conflicting names`,
      );
    }
    bySeat.set(seat, existing ?? row.playerName);
  }
  const players: ImportDraftPlayer[] = [...bySeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seatIndex, name]) => ({ name, seatIndex }));

  const roundMap = new Map<number, ImportDraftRound>();
  for (const row of rows) {
    const number = row.handNumber;
    let round = roundMap.get(number);
    if (!round) {
      round = { number, forceBurn: row.forcedBurn, entries: [] };
      roundMap.set(number, round);
    } else if (round.forceBurn !== row.forcedBurn) {
      throw new BadRequestException(
        `Round ${number} has conflicting force-burn flags`,
      );
    }
    const seatIndex = row.playerPosition - 1;
    if (round.entries.some((e) => e.seatIndex === seatIndex)) {
      throw new BadRequestException(
        `Round ${number} has two rows for position ${row.playerPosition}`,
      );
    }
    round.entries.push({
      seatIndex,
      bid: row.tricksBid,
      tricksTaken: row.tricksTaken,
    });
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const draft: ImportDraft = {
    name,
    gameDate: parseGameDate(raw.gameDate ?? raw.date),
    players,
    rounds: [...roundMap.values()].sort((a, b) => a.number - b.number),
    noteTexts: parseNoteTexts(raw.notes),
  };
  if (opts?.requireComplete !== false) {
    assertImportDraft(draft);
  } else if (draft.players.length < 2 || draft.players.length > 7) {
    throw new BadRequestException('Need 2–7 players');
  }
  return draft;
}

/** Pull a JSON object out of an LLM reply (fenced or raw). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new BadRequestException('LLM returned an empty response');
  }
  let body = trimmed;
  const fence = /^```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) {
    body = fence[1].trim();
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new BadRequestException('LLM response did not contain JSON');
  }
  const slice = body.slice(start, end + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    throw new BadRequestException('LLM response was not valid JSON');
  }
}
