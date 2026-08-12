import type { GameDetail, GameSummary, Standing } from '../api';
import { assertGameNotes, hasGameNotes, type GameNote } from './notes';
import {
  TOTAL_ROUNDS,
  bidOrderSeats,
  dealerSeat,
  forbiddenLastBid,
  getHandSize,
  newId,
  scoreRound,
} from './rules';
import {
  assertBids,
  assertTricks,
  assertTricksWithBids,
} from './validate';
import {
  appendEvent,
  assignPlacesByTotal,
  computeBidAnalytics,
  computeGameFinishStats,
  computeOutcome,
  cumulativeFieldsForRound,
  emptyEntryAnalytics,
  firstBidderSeat,
  recomputeAllCumulatives,
} from './analytics';

function defaultGameName(names: string[]): string {
  const d = new Date();
  const stamp = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${names.join(', ')} — ${stamp}`;
}

function recompute(game: GameDetail): GameDetail {
  const standings = computeStandings(game);
  let currentRound: number | null = null;
  let phase: GameDetail['phase'] = 'completed';

  for (const round of game.rounds) {
    const incomplete = round.entries.some(
      (e) => e.bid === null || e.tricksTaken === null || e.points === null,
    );
    if (incomplete) {
      currentRound = round.number;
      const allBids = round.entries.every((e) => e.bid !== null);
      phase = allBids ? 'tricks' : 'bidding';
      break;
    }
  }

  if (currentRound === null) {
    phase = 'completed';
  }

  const status: GameDetail['status'] =
    phase === 'completed'
      ? 'COMPLETED'
      : phase === 'tricks'
        ? 'PLAYING'
        : 'BIDDING';

  const rounds = game.rounds.map((round) => {
    const order =
      round.bidOrderSeats?.length === game.players.length
        ? round.bidOrderSeats
        : bidOrderSeats(round.number, game.players.length);
    const bidOrderPlayerIds = order.map(
      (seat) => game.players.find((p) => p.seatIndex === seat)!.id,
    );
    let prior = 0;
    const lastIdx = bidOrderPlayerIds.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      const e = round.entries.find((x) => x.playerId === bidOrderPlayerIds[i]);
      if (e?.bid != null) prior += e.bid;
    }
    const allBidsIn = round.entries.every((e) => e.bid !== null);
    const complete = round.entries.every(
      (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
    );
    return {
      ...round,
      bidOrderSeats: order,
      dealerPlayerId:
        round.dealerPlayerId ??
        game.players.find((p) => p.seatIndex === round.dealerSeat)?.id,
      firstBidderPlayerId:
        round.firstBidderPlayerId ??
        game.players.find((p) => p.seatIndex === round.firstBidderSeat)?.id,
      bidOrderPlayerIds,
      forbiddenLastBid: allBidsIn
        ? round.forbiddenLastBid
        : forbiddenLastBid(prior, round.handSize),
      complete,
    };
  });

  const finishedAt =
    phase === 'completed'
      ? (game.finishedAt ?? new Date().toISOString())
      : null;

  return {
    ...game,
    status,
    phase,
    currentRound,
    finishedAt,
    rounds,
    standings,
  };
}

function computeStandings(game: GameDetail): Standing[] {
  const totals = game.players.map((p) => {
    let total = 0;
    let roundsPlayed = 0;
    let bidsMade = 0;
    for (const round of game.rounds) {
      const e = round.entries.find((x) => x.playerId === p.id);
      if (e?.points != null) {
        total += e.points;
        roundsPlayed += 1;
        if (e.bid !== null && e.tricksTaken !== null && e.bid === e.tricksTaken) {
          bidsMade += 1;
        }
      }
    }
    return {
      playerId: p.id,
      playerName: p.name,
      seatIndex: p.seatIndex,
      total,
      roundsPlayed,
      bidsMade,
      place: 0,
    };
  });

  return assignPlacesByTotal(totals).sort((a, b) => a.seatIndex - b.seatIndex);
}

export function createLocalGame(
  playerNames: string[],
  name?: string,
  ids?: {
    gameId: string;
    playerIds: string[];
    playerUserIds?: (string | null)[];
  },
): GameDetail {
  const names = playerNames.map((n) => n.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 7) {
    throw new Error('Need 2–7 players');
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new Error('Player names must be unique');
  }
  const gameId = ids?.gameId ?? newId();
  const players = names.map((n, seatIndex) => ({
    id: ids?.playerIds[seatIndex] ?? newId(),
    name: n,
    seatIndex,
    userId: ids?.playerUserIds?.[seatIndex] ?? null,
  }));
  const n = players.length;
  const now = new Date().toISOString();
  const firstDealer = dealerSeat(1, n);

  const rounds = Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
    const number = i + 1;
    const handSize = getHandSize(number);
    const dSeat = dealerSeat(number, n);
    const order = bidOrderSeats(number, n);
    const first = firstBidderSeat(dSeat, n);
    return {
      id: newId(),
      number,
      handSize,
      dealerSeat: dSeat,
      firstBidderSeat: first,
      forceBurn: false,
      dealerPlayerId: players.find((p) => p.seatIndex === dSeat)?.id,
      firstBidderPlayerId: players.find((p) => p.seatIndex === first)?.id,
      bidOrderSeats: order,
      bidOrderPlayerIds: order.map(
        (seat) => players.find((p) => p.seatIndex === seat)!.id,
      ),
      bidSum: null,
      bidDeficit: null,
      forbiddenLastBid: null,
      bidsCompletedAt: null,
      tricksCompletedAt: null,
      completedAt: null,
      editCount: 0,
      entries: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        bid: null,
        tricksTaken: null,
        points: null,
        ...emptyEntryAnalytics(p.seatIndex, dSeat, order),
      })),
      complete: false,
    };
  });

  const base: GameDetail = {
    id: gameId,
    name: name?.trim() || defaultGameName(names),
    notes: [],
    status: 'BIDDING',
    playMode: 'IN_PERSON',
    liveCode: null,
    phase: 'bidding',
    currentRound: 1,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    playerCount: n,
    firstDealerSeat: firstDealer,
    winnerPlayerId: null,
    winnerScore: null,
    runnerUpScore: null,
    winMargin: null,
    totalForceBurns: 0,
    totalEdits: 0,
    players,
    rounds,
    standings: [],
    events: [],
  };

  const withEvent: GameDetail = {
    ...base,
    events: appendEvent(base, 'GAME_CREATED', {
      name: base.name,
      playerCount: n,
      firstDealerSeat: firstDealer,
      playerNames: names,
      playerIds: players.map((p) => p.id),
      seatOrder: players.map((p) => ({
        playerId: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      })),
    }),
  };

  return recompute(withEvent);
}

export function localSetBids(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  forceBurn = false,
): GameDetail {
  assertBids(game, roundNumber, bids);
  const bidMap = new Map(bids.map((b) => [b.playerId, b.bid]));
  for (const p of game.players) {
    if (bidMap.get(p.id) === undefined) {
      throw new Error('Bid missing for player');
    }
  }

  const round = game.rounds.find((r) => r.number === roundNumber)!;
  const analytics = computeBidAnalytics(
    game.players,
    round.dealerSeat,
    round.handSize,
    bids,
    forbiddenLastBid,
  );
  const now = new Date().toISOString();

  const rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      forceBurn,
      bidSum: analytics.bidSum,
      bidDeficit: analytics.bidDeficit,
      forbiddenLastBid: analytics.forbiddenLastBid,
      bidsCompletedAt: r.bidsCompletedAt ?? now,
      tricksCompletedAt: null,
      completedAt: null,
      entries: r.entries.map((e) => {
        const a = analytics.perPlayer.get(e.playerId)!;
        return {
          ...e,
          bid: a.bid,
          tricksTaken: null,
          points: null,
          bidPosition: a.bidPosition,
          isDealer: a.isDealer,
          isFirstBidder: a.isFirstBidder,
          isLastBidder: a.isLastBidder,
          runningBidBefore: a.runningBidBefore,
          made: null,
          trickDelta: null,
          absDelta: null,
          isNilBid: a.bid === 0,
          isNilMade: null,
          cumulativeScore: null,
          placeAfterRound: null,
          scoreBehindLeader: null,
        };
      }),
    };
  });

  const next: GameDetail = {
    ...game,
    startedAt: game.startedAt ?? now,
    finishedAt: null,
    durationMs: null,
    winnerPlayerId: null,
    winnerScore: null,
    runnerUpScore: null,
    winMargin: null,
    totalForceBurns: rounds.filter((r) => r.forceBurn).length,
    rounds,
    events: appendEvent(
      game,
      'BIDS_SET',
      {
        roundNumber,
        handSize: round.handSize,
        dealerSeat: round.dealerSeat,
        dealerPlayerId: round.dealerPlayerId,
        firstBidderSeat: round.firstBidderSeat,
        firstBidderPlayerId: round.firstBidderPlayerId,
        bidOrderSeats: analytics.order,
        bidSum: analytics.bidSum,
        bidDeficit: analytics.bidDeficit,
        forbiddenLastBid: analytics.forbiddenLastBid,
        forceBurn,
        bids: [...analytics.perPlayer.entries()]
          .map(([playerId, a]) => ({
            playerId,
            bid: a.bid,
            bidPosition: a.bidPosition,
            runningBidBefore: a.runningBidBefore,
            isDealer: a.isDealer,
            isLastBidder: a.isLastBidder,
          }))
          .sort((a, b) => a.bidPosition - b.bidPosition),
      },
      roundNumber,
    ),
  };

  return recompute(next);
}

export function localSetTricks(
  game: GameDetail,
  roundNumber: number,
  tricks: { playerId: string; tricksTaken: number }[],
): GameDetail {
  if (game.rounds.find((r) => r.number === roundNumber)?.entries.some((e) => e.bid === null)) {
    throw new Error('All bids must be set before tricks');
  }
  assertTricks(game, roundNumber, tricks);
  const trickMap = new Map(tricks.map((t) => [t.playerId, t.tricksTaken]));
  const now = new Date().toISOString();
  const isLast = roundNumber === TOTAL_ROUNDS;

  let rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      tricksCompletedAt: now,
      completedAt: now,
      entries: r.entries.map((e) => {
        const taken = trickMap.get(e.playerId);
        if (taken === undefined || e.bid === null) {
          throw new Error('Missing bid or tricks for player');
        }
        const o = computeOutcome(e.bid, taken, scoreRound);
        return {
          ...e,
          tricksTaken: taken,
          points: o.points,
          made: o.made,
          trickDelta: o.trickDelta,
          absDelta: o.absDelta,
          isNilBid: o.isNilBid,
          isNilMade: o.isNilMade,
        };
      }),
      complete: true,
    };
  });

  const roundsSnap = rounds.map((r) => ({
    number: r.number,
    forceBurn: r.forceBurn,
    entries: r.entries.map((e) => ({
      playerId: e.playerId,
      points: e.points,
    })),
  }));
  const cum = cumulativeFieldsForRound(game.players, roundsSnap, roundNumber);
  rounds = rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      entries: r.entries.map((e) => {
        const c = cum.get(e.playerId)!;
        return {
          ...e,
          cumulativeScore: c.cumulativeScore,
          placeAfterRound: c.placeAfterRound,
          scoreBehindLeader: c.scoreBehindLeader,
        };
      }),
    };
  });

  const finish = isLast
    ? computeGameFinishStats(
        game.players,
        rounds.map((r) => ({
          forceBurn: r.forceBurn,
          entries: r.entries.map((e) => ({
            playerId: e.playerId,
            points: e.points,
          })),
        })),
        game.createdAt,
        now,
      )
    : null;

  const next: GameDetail = {
    ...game,
    rounds,
    finishedAt: isLast ? now : null,
    durationMs: finish?.durationMs ?? null,
    winnerPlayerId: finish?.winnerPlayerId ?? null,
    winnerScore: finish?.winnerScore ?? null,
    runnerUpScore: finish?.runnerUpScore ?? null,
    winMargin: finish?.winMargin ?? null,
    totalForceBurns:
      finish?.totalForceBurns ?? rounds.filter((r) => r.forceBurn).length,
    events: appendEvent(
      game,
      'TRICKS_SET',
      {
        roundNumber,
        handSize: game.rounds.find((r) => r.number === roundNumber)!.handSize,
        bidSum: game.rounds.find((r) => r.number === roundNumber)!.bidSum,
        forceBurn: game.rounds.find((r) => r.number === roundNumber)!.forceBurn,
        tricks: [...tricks]
          .map((t) => {
            const e = rounds
              .find((r) => r.number === roundNumber)!
              .entries.find((x) => x.playerId === t.playerId)!;
            return {
              playerId: t.playerId,
              bid: e.bid,
              tricksTaken: t.tricksTaken,
              points: e.points,
              made: e.made,
              trickDelta: e.trickDelta,
              bidPosition: e.bidPosition,
            };
          })
          .sort((a, b) => {
            if (a.bidPosition == null || b.bidPosition == null) {
              throw new Error('Missing bidPosition for event payload');
            }
            return a.bidPosition - b.bidPosition;
          }),
        standingsAfter: [...cum.entries()].map(([playerId, c]) => ({
          playerId,
          ...c,
        })),
        gameCompleted: isLast,
        ...(finish
          ? {
              winnerPlayerId: finish.winnerPlayerId,
              winnerScore: finish.winnerScore,
              runnerUpScore: finish.runnerUpScore,
              winMargin: finish.winMargin,
              durationMs: finish.durationMs,
            }
          : {}),
      },
      roundNumber,
    ),
  };

  return recompute(next);
}

export function localUpdateRound(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  tricks: { playerId: string; tricksTaken: number }[],
  forceBurn = false,
): GameDetail {
  assertTricksWithBids(game, roundNumber, bids, tricks);
  const bidMap = new Map(bids.map((b) => [b.playerId, b.bid]));
  const trickMap = new Map(tricks.map((t) => [t.playerId, t.tricksTaken]));
  const round = game.rounds.find((r) => r.number === roundNumber)!;
  const analytics = computeBidAnalytics(
    game.players,
    round.dealerSeat,
    round.handSize,
    bids,
    forbiddenLastBid,
  );
  const now = new Date().toISOString();

  const before = {
    forceBurn: round.forceBurn,
    entries: round.entries.map((e) => ({
      playerId: e.playerId,
      bid: e.bid,
      tricksTaken: e.tricksTaken,
      points: e.points,
    })),
  };

  let rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      forceBurn,
      bidSum: analytics.bidSum,
      bidDeficit: analytics.bidDeficit,
      forbiddenLastBid: analytics.forbiddenLastBid,
      bidsCompletedAt: r.bidsCompletedAt ?? now,
      tricksCompletedAt: r.tricksCompletedAt ?? now,
      completedAt: r.completedAt ?? now,
      editCount: (r.editCount ?? 0) + 1,
      entries: r.entries.map((e) => {
        const bid = bidMap.get(e.playerId);
        const taken = trickMap.get(e.playerId);
        if (bid === undefined || taken === undefined) {
          throw new Error('Bid or tricks missing for player');
        }
        const a = analytics.perPlayer.get(e.playerId)!;
        const o = computeOutcome(bid, taken, scoreRound);
        return {
          ...e,
          bid,
          tricksTaken: taken,
          points: o.points,
          bidPosition: a.bidPosition,
          isDealer: a.isDealer,
          isFirstBidder: a.isFirstBidder,
          isLastBidder: a.isLastBidder,
          runningBidBefore: a.runningBidBefore,
          made: o.made,
          trickDelta: o.trickDelta,
          absDelta: o.absDelta,
          isNilBid: o.isNilBid,
          isNilMade: o.isNilMade,
        };
      }),
      complete: true,
    };
  });

  let next: GameDetail = {
    ...game,
    rounds,
    totalEdits: (game.totalEdits ?? 0) + 1,
    totalForceBurns: rounds.filter((r) => r.forceBurn).length,
    events: appendEvent(
      game,
      'ROUND_UPDATED',
      {
        roundNumber,
        before,
        after: {
          forceBurn,
          bidSum: analytics.bidSum,
          bidDeficit: analytics.bidDeficit,
          forbiddenLastBid: analytics.forbiddenLastBid,
          entries: tricks.map((t) => {
            const e = rounds
              .find((r) => r.number === roundNumber)!
              .entries.find((x) => x.playerId === t.playerId)!;
            return {
              playerId: t.playerId,
              bid: e.bid,
              tricksTaken: e.tricksTaken,
              points: e.points,
              made: e.made,
              trickDelta: e.trickDelta,
            };
          }),
        },
      },
      roundNumber,
    ),
  };

  next = recomputeAllCumulatives(next);
  next = recompute(next);

  if (next.phase === 'completed') {
    const finishedAt = next.finishedAt ?? now;
    const finish = computeGameFinishStats(
      next.players,
      next.rounds.map((r) => ({
        forceBurn: r.forceBurn,
        entries: r.entries.map((e) => ({
          playerId: e.playerId,
          points: e.points,
        })),
      })),
      next.createdAt,
      finishedAt,
    );
    next = {
      ...next,
      finishedAt,
      durationMs: finish.durationMs,
      winnerPlayerId: finish.winnerPlayerId,
      winnerScore: finish.winnerScore,
      runnerUpScore: finish.runnerUpScore,
      winMargin: finish.winMargin,
      totalForceBurns: finish.totalForceBurns,
    };
  } else {
    next = {
      ...next,
      finishedAt: null,
      durationMs: null,
      winnerPlayerId: null,
      winnerScore: null,
      runnerUpScore: null,
      winMargin: null,
    };
  }

  return next;
}

export function localUpdateNotes(
  game: GameDetail,
  notes: GameNote[],
): GameDetail {
  if (game.playMode === 'ONLINE') {
    throw new Error('Notes are only available on scorekeeper games');
  }
  return { ...game, notes: assertGameNotes(notes) };
}

export function toSummary(game: GameDetail): GameSummary {
  return {
    id: game.id,
    name: game.name,
    hasNotes: hasGameNotes(game.notes),
    status: game.status,
    playMode: game.playMode ?? 'IN_PERSON',
    liveCode: game.liveCode ?? null,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt,
    playerCount: game.players.length,
    players: game.players.map((p) => p.name),
    currentRound: game.currentRound,
    standings: game.standings,
  };
}
