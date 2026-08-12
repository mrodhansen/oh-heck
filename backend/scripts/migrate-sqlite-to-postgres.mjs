#!/usr/bin/env node
/**
 * Copy every row from prisma/dev.db (SQLite) into DATABASE_URL (Postgres).
 * Run after `prisma migrate deploy` against an empty (or additive) Postgres.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlitePath = process.env.SQLITE_PATH || path.join(root, 'prisma/dev.db');

const DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'expiresAt',
  'finishedAt',
  'startedAt',
  'seatedAt',
  'highTableAt',
  'bidsCompletedAt',
  'tricksCompletedAt',
  'completedAt',
  'dealtAt',
  'bidPlacedAt',
  'playedAt',
]);

const BOOL_FIELDS = new Set([
  'isHighTable',
  'forceBurn',
  'isDealer',
  'isFirstBidder',
  'isLastBidder',
  'followedSuit',
  'playedTrump',
  'isHost',
  'gone',
]);

const JSON_FIELDS = new Set([
  'notes',
  'bidOrderSeats',
  'trumpCard',
  'dealtHands',
  'trickHistory',
  'dealtHand',
  'cardsPlayed',
  'payload',
  'state',
]);

/** Insert order respects foreign keys. */
const TABLES = [
  ['User', 'user'],
  ['AuthSession', 'authSession'],
  ['Tournament', 'tournament'],
  ['TournamentPlayer', 'tournamentPlayer'],
  ['TournamentTable', 'tournamentTable'],
  ['TournamentTableSeat', 'tournamentTableSeat'],
  ['Game', 'game'],
  ['Player', 'player'],
  ['Round', 'round'],
  ['RoundEntry', 'roundEntry'],
  ['GameEvent', 'gameEvent'],
  ['Trick', 'trick'],
  ['TrickPlay', 'trickPlay'],
  ['LiveSession', 'liveSession'],
  ['LivePlayer', 'livePlayer'],
  ['LiveEvent', 'liveEvent'],
];

function sqliteJson(sql) {
  const raw = execFileSync('sqlite3', ['-json', sqlitePath, sql], {
    encoding: 'utf8',
  }).trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function asDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value);
  if (/^\d+$/.test(String(value))) return new Date(Number(value));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Bad date: ${value}`);
  }
  return d;
}

function asBool(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new Error(`Bad bool: ${value}`);
}

function asJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function coerce(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (DATE_FIELDS.has(key)) {
      out[key] = asDate(value);
    } else if (BOOL_FIELDS.has(key)) {
      out[key] = asBool(value);
    } else if (JSON_FIELDS.has(key)) {
      out[key] = asJson(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:/.test(url)) {
    throw new Error(`DATABASE_URL must be Postgres, got: ${url || '(empty)'}`);
  }

  const prisma = new PrismaClient();
  try {
    for (const [table, model] of TABLES) {
      const rows = sqliteJson(`SELECT * FROM "${table}"`).map(coerce);
      if (rows.length === 0) {
        console.log(`  ${table}: 0`);
        continue;
      }
      const result = await prisma[model].createMany({
        data: rows,
        skipDuplicates: true,
      });
      console.log(`  ${table}: ${result.count}/${rows.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
