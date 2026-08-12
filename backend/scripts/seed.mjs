#!/usr/bin/env node
/**
 * Fill Postgres with users, standalone games, and tournaments
 * in mixed states so stats / resume / claimable all have data.
 */
import { randomBytes, randomUUID, scryptSync } from 'crypto';
import { config as loadEnv } from 'dotenv';
import {
  GameEventType,
  GameStatus,
  PlayMode,
  PrismaClient,
  TournamentStage,
  TournamentStatus,
  TournamentTableStatus,
} from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();

const HAND_SIZES = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7];
const TOTAL_ROUNDS = 13;
const PASSWORD = 'demo';

const ACCOUNTS = [
  { username: 'demo', skill: 0.58 },
  { username: 'alex', skill: 0.78 },
  { username: 'sam', skill: 0.66 },
  { username: 'riley', skill: 0.41 },
  { username: 'jordan', skill: 0.71 },
  { username: 'casey', skill: 0.52 },
  { username: 'morgan', skill: 0.63 },
  { username: 'quinn', skill: 0.35 },
  { username: 'pat', skill: 0.6 },
  { username: 'nico', skill: 0.74 },
  { username: 'evan', skill: 0.48 },
  { username: 'priya', skill: 0.81 },
  { username: 'devon', skill: 0.55 },
  { username: 'sage', skill: 0.44 },
  { username: 'remy', skill: 0.69 },
  { username: 'kit', skill: 0.38 },
];

const GUEST_NAMES = [
  'Dad',
  'Mom',
  'Tess',
  'Bo',
  'Wynn',
  'Hale',
  'June',
  'Io',
  'Chris',
  'Lee',
  'Sky',
  'Ash',
];

const TABLE_TITLES = [
  'Friday kitchen table',
  'Sunday night',
  'Tuesday trio',
  'After work',
  'Porch sitting',
  'Snow day',
  'Cabin weekend',
  'Beach house',
  'Birthday seven',
  'Lunch break',
  'Late shift',
  'Holiday leftover',
  'Rain delay',
  'New deck night',
  'The rematch',
  'Quick two',
  'Neighbors',
  'Cousins',
  'Office leftover',
  'Camp lantern',
];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(rng, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function daysAgo(rng, min, max) {
  const days = min + rng() * (max - min);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

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

function forbiddenLast(prior, hand) {
  const f = hand - prior;
  if (f < 0 || f > hand) return null;
  return f;
}

function scoreRound(bid, tricks) {
  return bid === tricks ? 5 + tricks : -Math.abs(bid - tricks);
}

function genBids(order, hand, skills, rng) {
  const bids = [];
  let running = 0;
  for (let i = 0; i < order.length; i++) {
    const last = i === order.length - 1;
    const forbidden = last ? forbiddenLast(running, hand) : null;
    const skill = skills[i] ?? 0.5;
    const choices = [];
    const weights = [];
    for (let b = 0; b <= hand; b++) {
      if (b === forbidden) continue;
      let w = b <= 2 ? 6 : b <= 4 ? 3 : 1;
      if (skill > 0.65 && b >= 1 && b <= Math.min(3, hand)) w += 4;
      if (skill < 0.4 && b === 0) w += 3;
      choices.push(b);
      weights.push(w);
    }
    const bid = weighted(rng, choices, weights);
    bids.push(bid);
    running += bid;
  }
  return bids;
}

function genTricks(order, hand, bids, skills, rng) {
  const remainingPlayers = order.map((_, i) => i);
  const tricks = Array(order.length).fill(0);
  let left = hand;
  while (remainingPlayers.length > 1) {
    const idx = remainingPlayers.splice(
      Math.floor(rng() * remainingPlayers.length),
      1,
    )[0];
    const skill = skills[idx] ?? 0.5;
    const bid = bids[idx];
    let t;
    if (left > 0 && bid <= left && rng() < 0.35 + skill * 0.5) {
      t = bid;
    } else {
      t = Math.floor(rng() * (left + 1));
    }
    tricks[idx] = t;
    left -= t;
  }
  tricks[remainingPlayers[0]] = left;
  return tricks;
}

function weighted(rng, choices, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return choices[i];
  }
  return choices[choices.length - 1];
}

function balanceTableSizes(n, preferredSize = 7, minSize = 2, maxSize = 7) {
  if (n < minSize) throw new Error(`Need at least ${minSize} players`);
  if (n <= maxSize) return [n];
  const minTables = Math.ceil(n / maxSize);
  const maxTables = Math.floor(n / minSize);
  let best = null;
  let bestScore = -Infinity;
  for (let t = minTables; t <= maxTables; t++) {
    const base = Math.floor(n / t);
    const rem = n % t;
    const hi = base + (rem > 0 ? 1 : 0);
    if (base < minSize || hi > maxSize) continue;
    const sizes = Array.from({ length: t }, (_, i) => base + (i < rem ? 1 : 0));
    sizes.sort((a, b) => b - a);
    const min = sizes[sizes.length - 1];
    const max = sizes[0];
    const avgDist =
      sizes.reduce((s, x) => s + Math.abs(x - preferredSize), 0) / t;
    const score = min * 1000 - (max - min) * 100 - avgDist * 10 - t;
    if (score > bestScore) {
      bestScore = score;
      best = sizes;
    }
  }
  if (!best) throw new Error(`Cannot seat ${n}`);
  return best;
}

function displayName(username, rng) {
  if (rng() < 0.7) {
    return username[0].toUpperCase() + username.slice(1);
  }
  return username;
}

async function wipe() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TrickPlay",
      "Trick",
      "RoundEntry",
      "Round",
      "GameEvent",
      "LiveEvent",
      "LivePlayer",
      "LiveSession",
      "Player",
      "Game",
      "TournamentTableSeat",
      "TournamentTable",
      "TournamentPlayer",
      "Tournament",
      "AuthSession",
      "User"
    RESTART IDENTITY CASCADE;
  `);
}

async function createUsers() {
  const passwordHash = hashPassword(PASSWORD);
  const users = [];
  for (const a of ACCOUNTS) {
    const user = await prisma.user.create({
      data: { username: a.username, passwordHash },
    });
    users.push({ ...user, skill: a.skill });
  }
  return users;
}

function buildRoundPayloads({
  playerIds,
  skills,
  throughRound,
  throughPhase,
  forceBurnRounds,
  rng,
  startedAt,
}) {
  const n = playerIds.length;
  const rounds = [];
  for (let number = 1; number <= TOTAL_ROUNDS; number++) {
    const handSize = HAND_SIZES[number - 1];
    const dSeat = dealerSeat(number, n);
    const order = bidOrderSeats(number, n);
    const firstBidderSeat = order[0];
    const complete =
      number < throughRound ||
      (number === throughRound &&
        (throughPhase === 'tricks' || throughPhase === 'done'));
    const bidsOnly =
      number === throughRound && throughPhase === 'bids';
    const empty = !complete && !bidsOnly;

    const orderSkills = order.map((seat) => skills[seat]);
    const bids = empty ? null : genBids(order, handSize, orderSkills, rng);
    const tricks =
      complete && bids
        ? genTricks(order, handSize, bids, orderSkills, rng)
        : null;
    const bidBySeat = bids
      ? Object.fromEntries(order.map((seat, i) => [seat, bids[i]]))
      : null;
    const trickBySeat = tricks
      ? Object.fromEntries(order.map((seat, i) => [seat, tricks[i]]))
      : null;

    let running = 0;
    const runningBefore = [];
    for (const seat of order) {
      runningBefore[seat] = running;
      if (bidBySeat) running += bidBySeat[seat];
    }

    const forceBurn = Boolean(forceBurnRounds?.has(number)) && complete;
    const offsetMin = number * 8;
    const bidsAt = new Date(startedAt.getTime() + offsetMin * 60 * 1000);
    const tricksAt = new Date(bidsAt.getTime() + 6 * 60 * 1000);

    rounds.push({
      number,
      handSize,
      dealerSeat: dSeat,
      firstBidderSeat,
      dealerPlayerId: playerIds[dSeat],
      firstBidderPlayerId: playerIds[firstBidderSeat],
      bidOrderSeats: order,
      forceBurn,
      bidsCompletedAt: bids && !empty ? bidsAt : null,
      tricksCompletedAt: complete ? tricksAt : null,
      completedAt: complete ? tricksAt : null,
      editCount: complete && rng() < 0.08 ? 1 : 0,
      entries: playerIds.map((playerId, seat) => {
        const bidPosition = order.indexOf(seat);
        return {
          playerId,
          bidPosition,
          isDealer: seat === dSeat,
          isFirstBidder: bidPosition === 0,
          isLastBidder: bidPosition === order.length - 1,
          runningBidBefore: empty ? null : runningBefore[seat],
          bid: bidBySeat ? bidBySeat[seat] : null,
          tricksTaken: trickBySeat ? trickBySeat[seat] : null,
          points:
            bidBySeat && trickBySeat
              ? scoreRound(bidBySeat[seat], trickBySeat[seat])
              : null,
        };
      }),
    });
  }
  return rounds;
}

async function insertGame({
  title,
  names,
  userIds,
  createdAt,
  throughRound,
  throughPhase,
  forceBurnRounds,
  notes,
  rng,
  playMode = PlayMode.IN_PERSON,
  tournamentId = null,
  tournamentTableId = null,
  tournamentPlayerIds = null,
  isHighTable = false,
  tableNumber = null,
}) {
  const playerIds = names.map(() => randomUUID());
  const n = names.length;
  const firstDealerSeat = dealerSeat(1, n);
  const skills = names.map((_, i) => {
    const uid = userIds[i];
    return uid?.skill ?? 0.5;
  });
  const complete = throughRound >= TOTAL_ROUNDS && throughPhase !== 'none';
  const started =
    throughRound > 1 || throughPhase === 'bids' || throughPhase === 'tricks';
  const startedAt = started
    ? new Date(createdAt.getTime() + 20 * 60 * 1000)
    : null;
  const finishedAt = complete
    ? new Date(createdAt.getTime() + (70 + rng() * 50) * 60 * 1000)
    : null;
  let status = GameStatus.BIDDING;
  if (complete) status = GameStatus.COMPLETED;
  else if (throughPhase === 'tricks' || throughPhase === 'bids') {
    status = throughPhase === 'tricks' ? GameStatus.PLAYING : GameStatus.BIDDING;
  } else if (throughRound > 1) {
    status = GameStatus.BIDDING;
  }

  const rounds = buildRoundPayloads({
    playerIds,
    skills,
    throughRound,
    throughPhase: complete ? 'tricks' : throughPhase,
    forceBurnRounds,
    rng,
    startedAt: startedAt ?? createdAt,
  });

  const game = await prisma.game.create({
    data: {
      name: title,
      status,
      playMode,
      createdAt,
      updatedAt: finishedAt ?? startedAt ?? createdAt,
      startedAt,
      finishedAt,
      playerCount: n,
      firstDealerSeat,
      tournamentId,
      tournamentTableId,
      isHighTable,
      tableNumber,
      notes: notes ?? [],
      players: {
        create: names.map((name, seatIndex) => ({
          id: playerIds[seatIndex],
          name,
          seatIndex,
          userId: userIds[seatIndex]?.id ?? null,
          tournamentPlayerId: tournamentPlayerIds?.[seatIndex] ?? null,
          createdAt,
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
          editCount: r.editCount,
          createdAt,
          updatedAt: r.completedAt ?? createdAt,
          entries: {
            create: r.entries.map((e) => ({
              playerId: e.playerId,
              bidPosition: e.bidPosition,
              isDealer: e.isDealer,
              isFirstBidder: e.isFirstBidder,
              isLastBidder: e.isLastBidder,
              runningBidBefore: e.runningBidBefore,
              bid: e.bid,
              tricksTaken: e.tricksTaken,
              points: e.points,
              createdAt,
              updatedAt: r.completedAt ?? createdAt,
            })),
          },
        })),
      },
      events: {
        create: [
          {
            type: GameEventType.GAME_CREATED,
            payload: {
              name: title,
              playMode,
              playerCount: n,
              firstDealerSeat,
              playerNames: names,
              playerIds,
            },
            createdAt,
          },
        ],
      },
    },
  });
  return game;
}

function pickUniqueNames(rng, users, count, { claimRate, forceUnclaimedMatch }) {
  const names = [];
  const userIds = [];
  const used = new Set();
  const pool = shuffle(rng, [
    ...users.map((u) => ({ kind: 'user', user: u })),
    ...GUEST_NAMES.map((name) => ({ kind: 'guest', name })),
  ]);

  for (const item of pool) {
    if (names.length >= count) break;
    if (item.kind === 'user') {
      const label = displayName(item.user.username, rng);
      const key = label.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      names.push(label);
      const claim = forceUnclaimedMatch
        ? false
        : rng() < claimRate && !userIds.some((u) => u?.id === item.user.id);
      userIds.push(claim ? item.user : null);
    } else {
      const key = item.name.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      names.push(item.name);
      userIds.push(null);
    }
  }

  // If we still need seats, invent numbered guests
  let extra = 1;
  while (names.length < count) {
    const name = `Guest ${extra++}`;
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    names.push(name);
    userIds.push(null);
  }
  return { names, userIds };
}

async function seedStandalone(users) {
  const rng = mulberry32(20260812);
  let completed = 0;
  let active = 0;

  for (let i = 0; i < 48; i++) {
    const n = [3, 3, 4, 4, 4, 5, 5, 6, 7][i % 9];
    const { names, userIds } = pickUniqueNames(rng, users, n, {
      claimRate: 0.72,
      forceUnclaimedMatch: false,
    });
    const title = `${pick(rng, TABLE_TITLES)} ${i + 1}`;
    const createdAt = daysAgo(rng, 2, 110);
    const force = new Set();
    if (rng() < 0.35) force.add(1 + Math.floor(rng() * 13));
    const notes =
      rng() < 0.22
        ? [
            {
              id: randomUUID(),
              text: pick(rng, [
                'Dealer mixed the 1-card round. Still counts.',
                'House rule: no table talk after the bid.',
                'Riley wants a rematch.',
                'Played with the red deck.',
              ]),
              createdAt: createdAt.toISOString(),
              updatedAt: createdAt.toISOString(),
            },
          ]
        : [];
    await insertGame({
      title,
      names,
      userIds,
      createdAt,
      throughRound: 13,
      throughPhase: 'tricks',
      forceBurnRounds: force,
      notes,
      rng,
    });
    completed += 1;
  }

  // Games with an unclaimed seat whose name matches a username
  for (let i = 0; i < 8; i++) {
    const user = users[i % users.length];
    const n = 4 + (i % 3);
    const { names, userIds } = pickUniqueNames(rng, users, n - 1, {
      claimRate: 0.4,
      forceUnclaimedMatch: false,
    });
    const matchName = user.username[0].toUpperCase() + user.username.slice(1);
    if (!names.some((x) => x.toLowerCase() === matchName.toLowerCase())) {
      names.splice(i % names.length, 0, matchName);
      userIds.splice(i % userIds.length, 0, null);
    }
    await insertGame({
      title: `Unclaimed ${matchName} ${i + 1}`,
      names,
      userIds,
      createdAt: daysAgo(rng, 1, 25),
      throughRound: 13,
      throughPhase: 'tricks',
      forceBurnRounds: new Set(),
      notes: [],
      rng,
    });
    completed += 1;
  }

  const activeSpecs = [
    { throughRound: 1, throughPhase: 'none' },
    { throughRound: 1, throughPhase: 'bids' },
    { throughRound: 2, throughPhase: 'none' },
    { throughRound: 3, throughPhase: 'bids' },
    { throughRound: 5, throughPhase: 'tricks' },
    { throughRound: 6, throughPhase: 'none' },
    { throughRound: 7, throughPhase: 'bids' },
    { throughRound: 8, throughPhase: 'tricks' },
    { throughRound: 10, throughPhase: 'none' },
    { throughRound: 11, throughPhase: 'bids' },
    { throughRound: 12, throughPhase: 'tricks' },
    { throughRound: 12, throughPhase: 'none' },
  ];
  for (let i = 0; i < activeSpecs.length; i++) {
    const spec = activeSpecs[i];
    const n = 3 + (i % 5);
    const { names, userIds } = pickUniqueNames(rng, users, n, {
      claimRate: 0.6,
      forceUnclaimedMatch: false,
    });
    await insertGame({
      title: `In progress ${i + 1}`,
      names,
      userIds,
      createdAt: daysAgo(rng, 0.2, 8),
      throughRound: spec.throughRound,
      throughPhase: spec.throughPhase,
      forceBurnRounds: new Set(),
      notes: [],
      rng,
    });
    active += 1;
  }

  return { completed, active };
}

async function createTournamentShell({
  name,
  status,
  target,
  playerNames,
  createdAt,
  seatedAt = null,
  startedAt = null,
  highTableAt = null,
  finishedAt = null,
}) {
  return prisma.tournament.create({
    data: {
      name,
      status,
      targetPlayerCount: target,
      preferredTableSize: 7,
      minTableSize: 2,
      maxTableSize: 7,
      highTableSize: Math.min(7, playerNames.length),
      createdAt,
      updatedAt: finishedAt ?? highTableAt ?? startedAt ?? seatedAt ?? createdAt,
      seatedAt,
      startedAt,
      highTableAt,
      finishedAt,
      players: {
        create: playerNames.map((n, orderIndex) => ({
          name: n,
          orderIndex,
          createdAt,
        })),
      },
    },
    include: { players: { orderBy: { orderIndex: 'asc' } } },
  });
}

async function seatTables(tournament, sizes, rng, stage = TournamentStage.PRELIM) {
  const shuffled = shuffle(rng, tournament.players);
  const tables = [];
  let cursor = 0;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const slice = shuffled.slice(cursor, cursor + size);
    cursor += size;
    const dealerIdx = Math.floor(rng() * slice.length);
    const ordered = [
      ...slice.slice(dealerIdx + 1),
      ...slice.slice(0, dealerIdx + 1),
    ];
    const table = await prisma.tournamentTable.create({
      data: {
        tournamentId: tournament.id,
        tableNumber: i + 1,
        stage,
        isHighTable: stage === TournamentStage.HIGH_TABLE,
        status: TournamentTableStatus.PENDING,
        dealerSeat: ordered.length - 1,
        seats: {
          create: ordered.map((p, seatIndex) => ({
            tournamentPlayerId: p.id,
            seatIndex,
          })),
        },
      },
      include: {
        seats: {
          orderBy: { seatIndex: 'asc' },
          include: { tournamentPlayer: true },
        },
      },
    });
    tables.push(table);
  }
  return tables;
}

async function startTableGame(table, users, rng, spec, title) {
  const names = table.seats.map((s) => s.tournamentPlayer.name);
  const usedUsers = new Set();
  const userIds = names.map((name) => {
    const u = users.find((x) => x.username === name.toLowerCase());
    if (u && !usedUsers.has(u.id) && rng() < 0.75) {
      usedUsers.add(u.id);
      return u;
    }
    return null;
  });
  const game = await insertGame({
    title,
    names,
    userIds,
    createdAt: spec.createdAt,
    throughRound: spec.throughRound,
    throughPhase: spec.throughPhase,
    forceBurnRounds: spec.forceBurnRounds ?? new Set(),
    notes: [],
    rng,
    tournamentId: table.tournamentId,
    tournamentTableId: table.id,
    tournamentPlayerIds: table.seats.map((s) => s.tournamentPlayerId),
    isHighTable: table.isHighTable,
    tableNumber: table.tableNumber,
  });
  const complete = spec.throughRound >= 13 && spec.throughPhase !== 'none';
  await prisma.tournamentTable.update({
    where: { id: table.id },
    data: {
      status: complete
        ? TournamentTableStatus.COMPLETED
        : spec.throughRound > 1 || spec.throughPhase !== 'none'
          ? TournamentTableStatus.IN_PROGRESS
          : TournamentTableStatus.READY,
      startedAt: spec.createdAt,
      finishedAt: complete
        ? new Date(spec.createdAt.getTime() + 90 * 60 * 1000)
        : null,
    },
  });
  return game;
}

async function seedTournaments(users) {
  const rng = mulberry32(99);
  const accountNames = users.map(
    (u) => u.username[0].toUpperCase() + u.username.slice(1),
  );

  // OPEN — roster filling
  await createTournamentShell({
    name: 'Thursday draft',
    status: TournamentStatus.OPEN,
    target: 16,
    playerNames: accountNames.slice(0, 9),
    createdAt: daysAgo(rng, 0.5, 3),
  });

  // OPEN — just started
  await createTournamentShell({
    name: 'Need two more',
    status: TournamentStatus.OPEN,
    target: 8,
    playerNames: ['Alex', 'Sam', 'Riley', 'Jordan', 'Casey', 'Dad'],
    createdAt: daysAgo(rng, 0.1, 1),
  });

  // SEATED — tables ready, no games
  const seated = await createTournamentShell({
    name: 'Office 16',
    status: TournamentStatus.SEATED,
    target: 16,
    playerNames: [
      ...accountNames,
    ],
    createdAt: daysAgo(rng, 4, 8),
    seatedAt: daysAgo(rng, 1, 3),
  });
  const seatedTables = await seatTables(
    seated,
    balanceTableSizes(16),
    rng,
  );
  for (const tb of seatedTables) {
    await prisma.tournamentTable.update({
      where: { id: tb.id },
      data: { status: TournamentTableStatus.READY },
    });
  }

  // IN_PROGRESS — mixed table states
  const mixedNames = [
    ...accountNames.slice(0, 12),
    'Tess',
    'Bo',
    'Wynn',
    'Hale',
    'June',
    'Io',
    'Chris',
    'Lee',
    'Sky',
  ].slice(0, 21);
  const mixed = await createTournamentShell({
    name: 'Weekend 21',
    status: TournamentStatus.IN_PROGRESS,
    target: 21,
    playerNames: mixedNames,
    createdAt: daysAgo(rng, 6, 10),
    seatedAt: daysAgo(rng, 3, 5),
    startedAt: daysAgo(rng, 2, 3),
  });
  const mixedTables = await seatTables(mixed, balanceTableSizes(21), rng);
  await startTableGame(
    mixedTables[0],
    users,
    rng,
    {
      createdAt: daysAgo(rng, 2, 2.5),
      throughRound: 13,
      throughPhase: 'tricks',
    },
    'Weekend 21 · Table 1',
  );
  await startTableGame(
    mixedTables[1],
    users,
    rng,
    {
      createdAt: daysAgo(rng, 1.5, 2),
      throughRound: 7,
      throughPhase: 'bids',
    },
    'Weekend 21 · Table 2',
  );
  await prisma.tournamentTable.update({
    where: { id: mixedTables[2].id },
    data: { status: TournamentTableStatus.READY },
  });

  // Two-table Tuesday
  const tue = await createTournamentShell({
    name: 'Two-table Tuesday',
    status: TournamentStatus.IN_PROGRESS,
    target: 10,
    playerNames: accountNames.slice(0, 10),
    createdAt: daysAgo(rng, 2, 4),
    seatedAt: daysAgo(rng, 1, 2),
    startedAt: daysAgo(rng, 0.6, 1),
  });
  const tueTables = await seatTables(tue, balanceTableSizes(10), rng);
  await startTableGame(
    tueTables[0],
    users,
    rng,
    {
      createdAt: daysAgo(rng, 0.6, 0.8),
      throughRound: 4,
      throughPhase: 'tricks',
    },
    'Tuesday · Table 1',
  );
  await startTableGame(
    tueTables[1],
    users,
    rng,
    {
      createdAt: daysAgo(rng, 0.4, 0.6),
      throughRound: 1,
      throughPhase: 'none',
    },
    'Tuesday · Table 2',
  );

  // HIGH_TABLE — prelims done, finals bidding
  const finalsNames = accountNames.slice(0, 14);
  const finals = await createTournamentShell({
    name: 'Friday finals',
    status: TournamentStatus.HIGH_TABLE,
    target: 14,
    playerNames: finalsNames,
    createdAt: daysAgo(rng, 12, 16),
    seatedAt: daysAgo(rng, 10, 12),
    startedAt: daysAgo(rng, 8, 10),
    highTableAt: daysAgo(rng, 1, 2),
  });
  const prelimSizes = balanceTableSizes(14);
  const prelimTables = await seatTables(finals, prelimSizes, rng);
  const prelimStandings = [];
  for (let i = 0; i < prelimTables.length; i++) {
    await startTableGame(
      prelimTables[i],
      users,
      rng,
      {
        createdAt: daysAgo(rng, 7 - i, 8 - i),
        throughRound: 13,
        throughPhase: 'tricks',
      },
      `Friday prelim · Table ${i + 1}`,
    );
    const game = await prisma.game.findUnique({
      where: { tournamentTableId: prelimTables[i].id },
      include: {
        players: true,
        rounds: { include: { entries: true } },
      },
    });
    const totals = game.players.map((p) => ({
      tpId: p.tournamentPlayerId,
      name: p.name,
      total: game.rounds.reduce((s, r) => {
        const e = r.entries.find((x) => x.playerId === p.id);
        return s + (e?.points ?? 0);
      }, 0),
    }));
    totals.sort((a, b) => b.total - a.total);
    totals.forEach((row, idx) => {
      prelimStandings.push({
        ...row,
        place: idx + 1,
        tableId: prelimTables[i].id,
        tableNumber: prelimTables[i].tableNumber,
      });
    });
  }
  prelimStandings.sort((a, b) => a.place - b.place || b.total - a.total);
  const highTake = Math.min(7, finalsNames.length);
  const qualifiers = [];
  const taken = new Set();
  for (const row of prelimStandings) {
    if (qualifiers.length >= highTake) break;
    if (!row.tpId || taken.has(row.tpId)) continue;
    taken.add(row.tpId);
    qualifiers.push(row);
  }
  const highTable = await prisma.tournamentTable.create({
    data: {
      tournamentId: finals.id,
      tableNumber: 1,
      stage: TournamentStage.HIGH_TABLE,
      isHighTable: true,
      status: TournamentTableStatus.IN_PROGRESS,
      dealerSeat: qualifiers.length - 1,
      startedAt: daysAgo(rng, 0.8, 1.2),
      seats: {
        create: qualifiers.map((q, seatIndex) => ({
          tournamentPlayerId: q.tpId,
          seatIndex,
          sourceTableId: q.tableId,
          sourceTableNumber: q.tableNumber,
          sourcePlace: q.place,
          sourceScore: q.total,
        })),
      },
    },
    include: {
      seats: {
        orderBy: { seatIndex: 'asc' },
        include: { tournamentPlayer: true },
      },
    },
  });
  await startTableGame(
    highTable,
    users,
    rng,
    {
      createdAt: daysAgo(rng, 0.8, 1.1),
      throughRound: 3,
      throughPhase: 'bids',
    },
    'Friday finals · High table',
  );

  // COMPLETED tournaments
  await seedCompletedTournament(
    users,
    rng,
    'Spring invitational',
    accountNames.slice(0, 14),
    40,
  );
  await seedCompletedTournament(
    users,
    rng,
    'July kitchen cup',
    [...accountNames.slice(2, 10), 'Tess', 'Bo', 'Wynn', 'Dad'],
    25,
  );
}

async function seedCompletedTournament(users, rng, name, playerNames, daysBack) {
  const createdAt = daysAgo(rng, daysBack, daysBack + 4);
  const seatedAt = new Date(createdAt.getTime() + 2 * 3600_000);
  const startedAt = new Date(seatedAt.getTime() + 2 * 3600_000);
  const t = await createTournamentShell({
    name,
    status: TournamentStatus.COMPLETED,
    target: playerNames.length,
    playerNames,
    createdAt,
    seatedAt,
    startedAt,
    highTableAt: new Date(startedAt.getTime() + 5 * 3600_000),
    finishedAt: new Date(startedAt.getTime() + 8 * 3600_000),
  });
  const sizes = balanceTableSizes(playerNames.length);
  const tables = await seatTables(t, sizes, rng);
  const prelimStandings = [];
  for (let i = 0; i < tables.length; i++) {
    await startTableGame(
      tables[i],
      users,
      rng,
      {
        createdAt: new Date(startedAt.getTime() + i * 20 * 60_000),
        throughRound: 13,
        throughPhase: 'tricks',
      },
      `${name} · Table ${i + 1}`,
    );
    const game = await prisma.game.findUnique({
      where: { tournamentTableId: tables[i].id },
      include: {
        players: true,
        rounds: { include: { entries: true } },
      },
    });
    const totals = game.players.map((p) => ({
      tpId: p.tournamentPlayerId,
      name: p.name,
      total: game.rounds.reduce((s, r) => {
        const e = r.entries.find((x) => x.playerId === p.id);
        return s + (e?.points ?? 0);
      }, 0),
    }));
    totals.sort((a, b) => b.total - a.total);
    totals.forEach((row, idx) => {
      prelimStandings.push({
        ...row,
        place: idx + 1,
        tableId: tables[i].id,
        tableNumber: tables[i].tableNumber,
      });
    });
  }
  prelimStandings.sort((a, b) => a.place - b.place || b.total - a.total);
  const highTake = Math.min(7, playerNames.length);
  const qualifiers = [];
  const taken = new Set();
  for (const row of prelimStandings) {
    if (qualifiers.length >= highTake) break;
    if (!row.tpId || taken.has(row.tpId)) continue;
    taken.add(row.tpId);
    qualifiers.push(row);
  }
  const highTable = await prisma.tournamentTable.create({
    data: {
      tournamentId: t.id,
      tableNumber: 1,
      stage: TournamentStage.HIGH_TABLE,
      isHighTable: true,
      status: TournamentTableStatus.COMPLETED,
      dealerSeat: qualifiers.length - 1,
      startedAt: new Date(startedAt.getTime() + 6 * 3600_000),
      finishedAt: new Date(startedAt.getTime() + 8 * 3600_000),
      seats: {
        create: qualifiers.map((q, seatIndex) => ({
          tournamentPlayerId: q.tpId,
          seatIndex,
          sourceTableId: q.tableId,
          sourceTableNumber: q.tableNumber,
          sourcePlace: q.place,
          sourceScore: q.total,
        })),
      },
    },
    include: {
      seats: {
        orderBy: { seatIndex: 'asc' },
        include: { tournamentPlayer: true },
      },
    },
  });
  await startTableGame(
    highTable,
    users,
    rng,
    {
      createdAt: new Date(startedAt.getTime() + 6 * 3600_000),
      throughRound: 13,
      throughPhase: 'tricks',
    },
    `${name} · High table`,
  );
}

async function main() {
  console.log('Wiping existing rows…');
  await wipe();
  console.log('Creating accounts (password: demo)…');
  const users = await createUsers();
  console.log(`  ${users.length} users`);
  console.log('Seeding standalone games…');
  const standalone = await seedStandalone(users);
  console.log(
    `  ${standalone.completed} completed, ${standalone.active} in progress`,
  );
  console.log('Seeding tournaments…');
  await seedTournaments(users);

  const [gameCount, tourneyCount, userCount] = await Promise.all([
    prisma.game.count(),
    prisma.tournament.count(),
    prisma.user.count(),
  ]);
  const byStatus = await prisma.game.groupBy({
    by: ['status'],
    _count: true,
  });
  const tByStatus = await prisma.tournament.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('\nDone.');
  console.log(`  users: ${userCount}  (password for all: ${PASSWORD})`);
  console.log(`  games: ${gameCount}  ${JSON.stringify(Object.fromEntries(byStatus.map((r) => [r.status, r._count])))}`);
  console.log(`  tournaments: ${tourneyCount}  ${JSON.stringify(Object.fromEntries(tByStatus.map((r) => [r.status, r._count])))}`);
  console.log('  sign in as demo, alex, priya, sam, …');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
