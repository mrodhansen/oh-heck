#!/usr/bin/env node
/**
 * Additive load of the family Oh Heck log (scripts/data/oh-heck-log.json).
 *
 * Inserts games and players only. Never deletes. Skips a game when one with
 * the same title already exists. Reuses an existing Player of the same name
 * (claimed row preferred). Does not create or touch users, live sessions,
 * or tournaments.
 *
 * Games 1–2 have no tricks-taken column; those are inferred from bid + score
 * (unique, or the combination that sums to the hand size; remaining ties
 * prefer undertricks). Game 48 hand 13 recorded Addison at the wrong seat —
 * seating uses each player's modal position.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import {
  GameEventType,
  GameStatus,
  PlayMode,
  PrismaClient,
} from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();
const DATA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'data',
  'oh-heck-log.json',
);

function dealerSeat(roundNumber, playerCount) {
  return (playerCount - 1 + roundNumber - 1) % playerCount;
}

function bidOrderSeats(roundNumber, playerCount) {
  const dealer = dealerSeat(roundNumber, playerCount);
  const order = [];
  for (let i = 1; i <= playerCount; i++) {
    order.push((dealer + i) % playerCount);
  }
  return order;
}

function gameWhen(isoDate) {
  const createdAt = new Date(`${isoDate}T18:00:00.000Z`);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Bad game date ${isoDate}`);
  }
  const startedAt = createdAt;
  const finishedAt = new Date(createdAt.getTime() + 90 * 60 * 1000);
  return { createdAt, startedAt, finishedAt };
}

function gameTitle(number, isoDate) {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  const stamp = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Game ${number} · ${stamp}`;
}

async function resolvePlayer(name) {
  const rows = await prisma.player.findMany({
    where: { name },
    orderBy: { createdAt: 'asc' },
  });
  const claimed = rows.find((p) => p.userId);
  if (claimed) return { player: claimed, created: false };
  if (rows[0]) return { player: rows[0], created: false };
  const player = await prisma.player.create({ data: { name } });
  return { player, created: true };
}

async function resolvePlayers(names) {
  const byName = new Map();
  let created = 0;
  for (const name of names) {
    if (byName.has(name)) continue;
    const row = await resolvePlayer(name);
    if (row.created) created += 1;
    byName.set(name, row.player);
  }
  return { byName, created };
}

async function insertGame(spec, byName) {
  const names = spec.players;
  const n = names.length;
  if (n < 2) {
    throw new Error(`Game ${spec.n} has ${n} players`);
  }
  const { createdAt, startedAt, finishedAt } = gameWhen(spec.date);
  const title = gameTitle(spec.n, spec.date);
  const firstDealerSeat = dealerSeat(1, n);
  const playerIds = names.map((name) => {
    const player = byName.get(name);
    if (!player) throw new Error(`No player for ${name}`);
    return player.id;
  });

  const notes = (spec.notes ?? []).map((text, i) => {
    const at = new Date(createdAt.getTime() + (i + 1) * 1000).toISOString();
    return { id: randomUUID(), text, createdAt: at, updatedAt: at };
  });

  const rounds = spec.rounds.map((r) => {
    const dSeat = dealerSeat(r.n, n);
    const order = bidOrderSeats(r.n, n);
    if (r.entries.length !== n) {
      throw new Error(`Game ${spec.n} round ${r.n} entry count`);
    }
    let running = 0;
    const runningBefore = [];
    for (const seat of order) {
      runningBefore[seat] = running;
      running += r.entries[seat].bid;
    }
    const offsetMin = r.n * 6;
    const at = new Date(startedAt.getTime() + offsetMin * 60 * 1000);
    return {
      number: r.n,
      handSize: r.hand,
      dealerSeat: dSeat,
      firstBidderSeat: order[0],
      dealerPlayerId: playerIds[dSeat],
      firstBidderPlayerId: playerIds[order[0]],
      bidOrderSeats: order,
      forceBurn: Boolean(r.forceBurn),
      bidsCompletedAt: at,
      tricksCompletedAt: at,
      completedAt: at,
      createdAt,
      updatedAt: at,
      entries: r.entries.map((e, seat) => {
        const bidPosition = order.indexOf(seat);
        return {
          playerId: playerIds[seat],
          bidPosition,
          isDealer: seat === dSeat,
          isFirstBidder: bidPosition === 0,
          isLastBidder: bidPosition === n - 1,
          runningBidBefore: runningBefore[seat],
          bid: e.bid,
          tricksTaken: e.tricks,
          points: e.points,
          createdAt,
          updatedAt: at,
        };
      }),
    };
  });

  const already = await prisma.game.findFirst({
    where: { name: title },
    select: { id: true },
  });
  if (already) return 'skipped';

  await prisma.game.create({
    data: {
      name: title,
      status: GameStatus.COMPLETED,
      playMode: PlayMode.IN_PERSON,
      createdAt,
      updatedAt: finishedAt,
      startedAt,
      finishedAt,
      playerCount: n,
      firstDealerSeat,
      notes,
      seats: {
        create: names.map((_, seatIndex) => ({
          seatIndex,
          player: { connect: { id: playerIds[seatIndex] } },
        })),
      },
      rounds: {
        create: rounds.map((r) => ({
          number: r.number,
          handSize: r.handSize,
          dealerSeat: r.dealerSeat,
          firstBidderSeat: r.firstBidderSeat,
          dealerPlayerId: r.dealerPlayerId,
          firstBidderPlayerId: r.firstBidderPlayerId,
          bidOrderSeats: r.bidOrderSeats,
          forceBurn: r.forceBurn,
          bidsCompletedAt: r.bidsCompletedAt,
          tricksCompletedAt: r.tricksCompletedAt,
          completedAt: r.completedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          entries: { create: r.entries },
        })),
      },
      events: {
        create: [
          {
            type: GameEventType.GAME_CREATED,
            payload: {
              name: title,
              playMode: PlayMode.IN_PERSON,
              playerCount: n,
              firstDealerSeat,
              playerNames: names,
              playerIds,
            },
            createdAt,
          },
          {
            type: GameEventType.GAME_COMPLETED,
            payload: { name: title, playerCount: n },
            createdAt: finishedAt,
          },
        ],
      },
    },
  });
  return 'inserted';
}

async function main() {
  const payload = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  if (!payload?.games?.length) {
    throw new Error(`No games in ${DATA_PATH}`);
  }

  const names = [...new Set(payload.games.flatMap((g) => g.players))];
  names.sort((a, b) => a.localeCompare(b));
  console.log(`Resolving ${names.length} players (create if missing)…`);
  const { byName, created: playersCreated } = await resolvePlayers(names);
  console.log(`  created ${playersCreated}, reused ${names.length - playersCreated}`);

  console.log(`Inserting games from the family log (${payload.games.length})…`);
  let inserted = 0;
  let skipped = 0;
  for (const spec of payload.games) {
    if (spec.players.length > 7) {
      throw new Error(`Game ${spec.n} has ${spec.players.length} players (max 7)`);
    }
    const result = await insertGame(spec, byName);
    if (result === 'skipped') skipped += 1;
    else inserted += 1;
  }

  const [gameCount, playerCount] = await Promise.all([
    prisma.game.count(),
    prisma.player.count(),
  ]);
  console.log('\nDone.');
  console.log(`  games inserted: ${inserted}  skipped (already present): ${skipped}`);
  console.log(`  players created: ${playersCreated}`);
  console.log(`  totals now: ${gameCount} games, ${playerCount} players`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
