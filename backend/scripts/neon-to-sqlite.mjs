#!/usr/bin/env node
/**
 * One-time Neon Postgres → SQLite copy.
 *
 *   node scripts/neon-to-sqlite.mjs dump  [dump.json]   # uses DATABASE_URL / NEON_DATABASE_URL
 *   node scripts/neon-to-sqlite.mjs load  [dump.json]   # uses SQLITE_DATABASE_URL (file:…)
 *   node scripts/neon-to-sqlite.mjs copy  [dump.json]   # dump then load
 *
 * Load fails if the SQLite file already has rows.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MODELS = [
  'user',
  'authSession',
  'tournament',
  'player',
  'tournamentRoster',
  'tournamentTable',
  'tournamentTableSeat',
  'game',
  'gamePlayer',
  'liveSession',
  'round',
  'roundEntry',
  'trick',
  'trickPlay',
  'gameEvent',
];

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

function defaultDumpPath() {
  return path.join(root, 'prisma/.neon-dump.json');
}

function run(cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status})`);
  }
}

function loadClient() {
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient();
}

async function dump(outPath) {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!/^postgres(ql)?:/.test(url)) {
    throw new Error('dump requires NEON_DATABASE_URL or DATABASE_URL (postgres)');
  }
  run('npx', ['prisma', 'generate']);
  const prisma = loadClient();
  try {
    const data = {};
    for (const model of MODELS) {
      data[model] = await prisma[model].findMany();
    }
    writeFileSync(outPath, JSON.stringify(data));
    const counts = Object.fromEntries(
      MODELS.map((m) => [m, data[m].length]),
    );
    console.log(`wrote ${outPath}`);
    console.log(counts);
  } finally {
    await prisma.$disconnect();
  }
}

function asDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Bad date: ${value}`);
  }
  return d;
}

function coerce(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (DATE_FIELDS.has(key)) {
      out[key] = asDate(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function load(dumpPath) {
  const url = process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!/^(file:|sqlite:)/.test(url)) {
    throw new Error('load requires SQLITE_DATABASE_URL or DATABASE_URL (file:…)');
  }
  run('bash', ['scripts/prisma-sqlite.sh', 'push'], { DATABASE_URL: url });
  const prisma = loadClient();
  try {
    const existing = await prisma.user.count();
    if (existing > 0) {
      throw new Error(
        `refusing to load: SQLite already has ${existing} user(s). Delete the db file first.`,
      );
    }
    const raw = JSON.parse(readFileSync(dumpPath, 'utf8'));
    if (!raw || typeof raw !== 'object') {
      throw new Error(`invalid dump: ${dumpPath}`);
    }
    for (const model of MODELS) {
      const rows = Array.isArray(raw[model]) ? raw[model].map(coerce) : [];
      if (rows.length === 0) {
        console.log(`  ${model}: 0`);
        continue;
      }
      const result = await prisma[model].createMany({ data: rows });
      if (result.count !== rows.length) {
        throw new Error(
          `${model}: inserted ${result.count}/${rows.length}`,
        );
      }
      console.log(`  ${model}: ${result.count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const cmd = process.argv[2];
  const dumpPath = path.resolve(process.argv[3] || defaultDumpPath());
  if (cmd === 'dump') {
    await dump(dumpPath);
    return;
  }
  if (cmd === 'load') {
    await load(dumpPath);
    return;
  }
  if (cmd === 'copy') {
    await dump(dumpPath);
    await load(dumpPath);
    return;
  }
  throw new Error('usage: neon-to-sqlite.mjs dump|load|copy [dump.json]');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
