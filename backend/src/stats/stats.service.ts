import { Injectable } from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assignPlacesByTotal } from '../games/analytics';

type PlayerAgg = {
  /** Stable key: user:<id> */
  key: string;
  userId: string | null;
  name: string;
  gamesPlayed: number;
  gamesCompleted: number;
  wins: number;
  seconds: number;
  thirds: number;
  podium: number;
  totalScore: number;
  avgScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  roundsPlayed: number;
  bidsMade: number;
  bidAccuracy: number | null;
  totalPointsFromRounds: number;
  nilBids: number;
  nilsMade: number;
  forceBurns: number;
  overtricks: number;
  undertricks: number;
  biggestRound: number | null;
  smallestRound: number | null;
  perfectGames: number;
};

type Leader = { name: string; value: number | string } | null;

type SeatRef = {
  id: string;
  /** Account username (stats identity). */
  name: string;
  /** Original table name; never overwritten by claim. */
  tableName: string;
  userId: string;
  key: string;
};

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    // Stats only include fully completed games.
    const games = await this.prisma.game.findMany({
      where: { status: GameStatus.COMPLETED },
      include: {
        players: {
          orderBy: { seatIndex: 'asc' },
          include: { user: { select: { username: true } } },
        },
        rounds: { include: { entries: true }, orderBy: { number: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byKey = new Map<string, PlayerAgg>();

    const ensure = (seat: SeatRef): PlayerAgg => {
      let row = byKey.get(seat.key);
      if (!row) {
        row = {
          key: seat.key,
          userId: seat.userId,
          name: seat.name,
          gamesPlayed: 0,
          gamesCompleted: 0,
          wins: 0,
          seconds: 0,
          thirds: 0,
          podium: 0,
          totalScore: 0,
          avgScore: null,
          bestScore: null,
          worstScore: null,
          roundsPlayed: 0,
          bidsMade: 0,
          bidAccuracy: null,
          totalPointsFromRounds: 0,
          nilBids: 0,
          nilsMade: 0,
          forceBurns: 0,
          overtricks: 0,
          undertricks: 0,
          biggestRound: null,
          smallestRound: null,
          perfectGames: 0,
        };
        byKey.set(seat.key, row);
      }
      return row;
    };

    let totalForceBurns = 0;
    let highestGameScore: {
      name: string;
      value: number;
      gameId: string;
    } | null = null;
    let lowestGameScore: {
      name: string;
      value: number;
      gameId: string;
    } | null = null;
    let biggestMargin: {
      winner: string;
      margin: number;
      gameId: string;
    } | null = null;

    const gameRows: {
      id: string;
      name: string | null;
      status: GameStatus;
      createdAt: Date;
      finishedAt: Date | null;
      playerCount: number;
      players: string[];
      winner: string | null;
      winnerScore: number | null;
      highScore: number | null;
      lowScore: number | null;
      avgScore: number | null;
      roundsCompleted: number;
      forceBurns: number;
      standings: { name: string; total: number; place: number }[];
    }[] = [];

    for (const game of games) {
      let roundsCompleted = 0;
      let forceBurns = 0;
      for (const round of game.rounds) {
        if (round.forceBurn) {
          forceBurns += 1;
          totalForceBurns += 1;
        }
        if (
          round.entries.every(
            (e) =>
              e.bid !== null && e.tricksTaken !== null && e.points !== null,
          )
        ) {
          roundsCompleted += 1;
        }
      }

      const seats = game.players.map((p) => seatRef(p));

      const playerTotals = game.players.map((p, idx) => {
        const seat = seats[idx] ?? null;
        let total = 0;
        let roundsPlayed = 0;
        let bidsMade = 0;
        let madeAll = true;
        const agg = seat ? ensure(seat) : null;
        if (agg) {
          agg.gamesPlayed += 1;
          agg.gamesCompleted += 1;
        }

        for (const round of game.rounds) {
          const e = round.entries.find((x) => x.playerId === p.id);
          if (
            !e ||
            e.points === null ||
            e.bid === null ||
            e.tricksTaken === null
          ) {
            madeAll = false;
            continue;
          }
          roundsPlayed += 1;
          total += e.points;
          if (agg) {
            agg.roundsPlayed += 1;
            agg.totalPointsFromRounds += e.points;
          }

          if (e.bid === e.tricksTaken) {
            bidsMade += 1;
            if (agg) agg.bidsMade += 1;
          } else {
            madeAll = false;
            if (agg) {
              if (e.tricksTaken > e.bid) agg.overtricks += 1;
              else agg.undertricks += 1;
            }
          }

          if (e.bid === 0 && agg) {
            agg.nilBids += 1;
            if (e.tricksTaken === 0) agg.nilsMade += 1;
          }

          if (round.forceBurn && agg) {
            const dealer = game.players.find(
              (pl) => pl.seatIndex === round.dealerSeat,
            );
            if (dealer?.id === p.id) agg.forceBurns += 1;
          }

          if (agg) {
            agg.biggestRound =
              agg.biggestRound === null
                ? e.points
                : Math.max(agg.biggestRound, e.points);
            agg.smallestRound =
              agg.smallestRound === null
                ? e.points
                : Math.min(agg.smallestRound, e.points);
          }
        }

        return {
          name: seat?.name ?? p.name,
          key: seat?.key ?? guestKey(p.name),
          registered: seat !== null,
          total,
          roundsPlayed,
          bidsMade,
          madeAll: madeAll && roundsPlayed === 13,
        };
      });

      const places = assignPlacesByTotal(playerTotals);

      const scores = places.map((p) => p.total);
      const highScore = scores.length ? Math.max(...scores) : null;
      const lowScore = scores.length ? Math.min(...scores) : null;
      const avgScore =
        scores.length > 0
          ? round2(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

      const top = places.filter((p) => p.place === 1);
      const winner = top.length ? top.map((t) => t.name).join(', ') : null;
      const winnerScore = top[0]?.total ?? null;

      if (places.length >= 2 && winnerScore !== null && top[0]?.registered) {
        const secondBest = places.find((p) => p.place > 1);
        if (secondBest) {
          const margin = winnerScore - secondBest.total;
          if (!biggestMargin || margin > biggestMargin.margin) {
            biggestMargin = {
              winner: top[0]!.name,
              margin,
              gameId: game.id,
            };
          }
        }
      }

      for (const row of places) {
        const keyed = row as {
          key: string;
          name: string;
          registered: boolean;
          total: number;
          place: number;
          madeAll?: boolean;
        };
        if (!keyed.registered) continue;
        const seat = seats.find(
          (s): s is SeatRef => s !== null && s.key === keyed.key,
        );
        if (!seat) continue;
        const agg = ensure(seat);
        agg.totalScore += keyed.total;
        agg.bestScore =
          agg.bestScore === null
            ? keyed.total
            : Math.max(agg.bestScore, keyed.total);
        agg.worstScore =
          agg.worstScore === null
            ? keyed.total
            : Math.min(agg.worstScore, keyed.total);
        if (keyed.place === 1) agg.wins += 1;
        if (keyed.place === 2) agg.seconds += 1;
        if (keyed.place === 3) agg.thirds += 1;
        if (keyed.place <= 3) agg.podium += 1;
        if (keyed.madeAll) agg.perfectGames += 1;

        if (!highestGameScore || row.total > highestGameScore.value) {
          highestGameScore = {
            name: row.name,
            value: row.total,
            gameId: game.id,
          };
        }
        if (!lowestGameScore || row.total < lowestGameScore.value) {
          lowestGameScore = {
            name: row.name,
            value: row.total,
            gameId: game.id,
          };
        }
      }

      gameRows.push({
        id: game.id,
        name: game.name,
        status: game.status,
        createdAt: game.createdAt,
        finishedAt: game.finishedAt,
        playerCount: game.players.length,
        players: game.players.map((p, i) => seats[i]?.name ?? p.name),
        winner,
        winnerScore,
        highScore,
        lowScore,
        avgScore,
        roundsCompleted,
        forceBurns,
        standings: places.map((p) => ({
          name: p.name,
          total: p.total,
          place: p.place,
        })),
      });
    }

    const players = [...byKey.values()]
      .map((p) => ({
        ...p,
        avgScore:
          p.gamesCompleted > 0
            ? round2(p.totalScore / p.gamesCompleted)
            : null,
        bidAccuracy:
          p.roundsPlayed > 0
            ? round2((p.bidsMade / p.roundsPlayed) * 100)
            : null,
        nilSuccessRate:
          p.nilBids > 0 ? round2((p.nilsMade / p.nilBids) * 100) : null,
        winRate:
          p.gamesCompleted > 0
            ? round2((p.wins / p.gamesCompleted) * 100)
            : null,
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if ((b.avgScore ?? -9999) !== (a.avgScore ?? -9999)) {
          return (b.avgScore ?? -9999) - (a.avgScore ?? -9999);
        }
        return a.name.localeCompare(b.name);
      });

    const leaders = {
      mostWins: pickLeader(players, (p) => p.wins, (p) => `${p.wins}`),
      highestAvg: pickLeader(
        players.filter((p) => p.gamesCompleted > 0),
        (p) => p.avgScore ?? -Infinity,
        (p) => String(p.avgScore),
      ),
      bestSingleGame: highestGameScore
        ? {
            name: highestGameScore.name,
            value: highestGameScore.value,
          }
        : null,
      worstSingleGame: lowestGameScore
        ? {
            name: lowestGameScore.name,
            value: lowestGameScore.value,
          }
        : null,
      bestBidAccuracy: pickLeader(
        players.filter((p) => p.roundsPlayed >= 5),
        (p) => p.bidAccuracy ?? -Infinity,
        (p) => `${p.bidAccuracy}%`,
      ),
      mostNils: pickLeader(
        players,
        (p) => p.nilsMade,
        (p) => `${p.nilsMade}`,
      ),
      biggestRound: pickLeader(
        players.filter((p) => p.biggestRound !== null),
        (p) => p.biggestRound ?? -Infinity,
        (p) => String(p.biggestRound),
      ),
      mostPodiums: pickLeader(players, (p) => p.podium, (p) => `${p.podium}`),
      mostForceBurns: pickLeader(
        players,
        (p) => p.forceBurns,
        (p) => `${p.forceBurns}`,
      ),
      perfectGames: pickLeader(
        players,
        (p) => p.perfectGames,
        (p) => `${p.perfectGames}`,
      ),
      biggestMargin: biggestMargin
        ? {
            name: biggestMargin.winner,
            value: biggestMargin.margin,
          }
        : null,
    };

    return {
      overview: {
        totalGames: games.length,
        completedGames: games.length,
        uniquePlayers: players.length,
        totalForceBurns,
        totalRoundsPlayed: players.reduce((s, p) => s + p.roundsPlayed, 0),
        leaders,
      },
      games: gameRows,
      players,
    };
  }
}

function seatRef(p: {
  id: string;
  name: string;
  userId: string | null;
  user: { username: string } | null;
}): SeatRef | null {
  if (!p.userId || !p.user) return null;
  return {
    id: p.id,
    userId: p.userId,
    name: p.user.username,
    tableName: p.name,
    key: userKey(p.userId),
  };
}

function userKey(userId: string): string {
  return `user:${userId}`;
}

function guestKey(name: string): string {
  return `guest:${name.trim()}`;
}

function pickLeader<T extends { name: string }>(
  list: T[],
  score: (p: T) => number,
  format: (p: T) => string,
): Leader {
  if (list.length === 0) return null;
  let best = list[0];
  let bestScore = score(best);
  for (const p of list.slice(1)) {
    const s = score(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  if (!Number.isFinite(bestScore) || bestScore === -Infinity) return null;
  if (bestScore === 0 && list.every((p) => score(p) === 0)) return null;
  return { name: best.name, value: format(best) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
