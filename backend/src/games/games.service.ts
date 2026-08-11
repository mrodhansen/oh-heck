import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GameStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TournamentsService } from '../tournaments/tournaments.service';
import {
  CreateGameDto,
  SetBidsDto,
  SetTricksDto,
  UpdateRoundDto,
} from './dto';
// CreateGameDto etc. also used by syncOperations validation

const gameInclude = {
  players: { orderBy: { seatIndex: 'asc' as const } },
  rounds: {
    orderBy: { number: 'asc' as const },
    include: {
      entries: {
        include: { player: true },
      },
    },
  },
} satisfies Prisma.GameInclude;

type FullGame = Prisma.GameGetPayload<{ include: typeof gameInclude }>;

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => TournamentsService))
    private readonly tournaments: TournamentsService,
  ) {}

  async listGames() {
    const games = await this.prisma.game.findMany({
      where: { tournamentId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        players: { orderBy: { seatIndex: 'asc' } },
        rounds: {
          include: { entries: true },
        },
      },
    });
    return games.map((g) => this.toSummary(g));
  }

  async createGame(dto: CreateGameDto) {
    const limits = this.rules.getPlayerLimits();
    const names = dto.playerNames.map((n) => n.trim()).filter(Boolean);
    if (names.length < limits.min || names.length > limits.max) {
      throw new BadRequestException(
        `Need ${limits.min}–${limits.max} players`,
      );
    }
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      throw new BadRequestException('Player names must be unique');
    }

    const totalRounds = this.rules.getTotalRounds();
    const playerCount = names.length;

    if (dto.playerIds && dto.playerIds.length !== names.length) {
      throw new BadRequestException('playerIds must match playerNames length');
    }
    if (dto.playerIds && new Set(dto.playerIds).size !== dto.playerIds.length) {
      throw new BadRequestException('playerIds must be unique');
    }

    if (dto.id) {
      const existing = await this.prisma.game.findUnique({
        where: { id: dto.id },
        include: gameInclude,
      });
      if (existing) {
        const existingNames = existing.players
          .slice()
          .sort((a, b) => a.seatIndex - b.seatIndex)
          .map((p) => p.name);
        const namesMatch =
          existingNames.length === names.length &&
          existingNames.every(
            (n, i) => n.toLowerCase() === names[i].toLowerCase(),
          );
        if (!namesMatch) {
          throw new BadRequestException(
            'Game id already exists with different players',
          );
        }
        if (dto.playerIds) {
          const existingIds = existing.players
            .slice()
            .sort((a, b) => a.seatIndex - b.seatIndex)
            .map((p) => p.id);
          const idsMatch = existingIds.every((id, i) => id === dto.playerIds![i]);
          if (!idsMatch) {
            throw new BadRequestException(
              'Game id already exists with different player ids',
            );
          }
        }
        return this.toDetail(existing);
      }
    }

    const game = await this.prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          name: dto.name?.trim() || defaultGameName(names),
          status: GameStatus.BIDDING,
          players: {
            create: names.map((name, seatIndex) => ({
              ...(dto.playerIds ? { id: dto.playerIds[seatIndex] } : {}),
              name,
              seatIndex,
            })),
          },
        },
        include: { players: { orderBy: { seatIndex: 'asc' } } },
      });

      for (let r = 1; r <= totalRounds; r++) {
        const handSize = this.rules.getHandSize(r);
        const dealerSeat = this.rules.dealerSeat(r, playerCount);
        const round = await tx.round.create({
          data: {
            gameId: created.id,
            number: r,
            handSize,
            dealerSeat,
            entries: {
              create: created.players.map((p) => ({
                playerId: p.id,
              })),
            },
          },
        });
        void round;
      }

      return tx.game.findUniqueOrThrow({
        where: { id: created.id },
        include: gameInclude,
      });
    });

    return this.emitGame(this.toDetail(game));
  }

  async syncOperations(
    operations: {
      type: 'createGame' | 'setBids' | 'setTricks' | 'updateRound';
      payload: Record<string, unknown>;
    }[],
  ) {
    const { plainToInstance } = await import('class-transformer');
    const { validateOrReject } = await import('class-validator');
    const results: {
      ok: boolean;
      type: string;
      error?: string;
      data?: unknown;
    }[] = [];

    for (const op of operations) {
      try {
        let data: unknown;
        switch (op.type) {
          case 'createGame': {
            const dto = plainToInstance(CreateGameDto, op.payload);
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.createGame(dto);
            break;
          }
          case 'setBids': {
            const gameId = String(op.payload.gameId ?? '');
            const roundNumber = Number(op.payload.roundNumber);
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid setBids payload');
            }
            const dto = plainToInstance(SetBidsDto, {
              bids: op.payload.bids,
              forceBurn: op.payload.forceBurn,
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.setBids(gameId, roundNumber, dto);
            break;
          }
          case 'setTricks': {
            const gameId = String(op.payload.gameId ?? '');
            const roundNumber = Number(op.payload.roundNumber);
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid setTricks payload');
            }
            const dto = plainToInstance(SetTricksDto, {
              tricks: op.payload.tricks,
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.setTricks(gameId, roundNumber, dto);
            break;
          }
          case 'updateRound': {
            const gameId = String(op.payload.gameId ?? '');
            const roundNumber = Number(op.payload.roundNumber);
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid updateRound payload');
            }
            const dto = plainToInstance(UpdateRoundDto, {
              bids: op.payload.bids,
              tricks: op.payload.tricks,
              forceBurn: op.payload.forceBurn,
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.updateRound(gameId, roundNumber, dto);
            break;
          }
          default:
            throw new BadRequestException(`Unknown op type`);
        }
        results.push({ ok: true, type: op.type, data });
      } catch (e) {
        let message = 'Sync operation failed';
        if (Array.isArray(e)) {
          message = e
            .map((err) =>
              typeof err === 'object' && err && 'toString' in err
                ? String(err)
                : JSON.stringify(err),
            )
            .join('; ');
        } else if (e instanceof Error) {
          message = e.message;
        }
        results.push({ ok: false, type: op.type, error: message });
        break;
      }
    }

    return { results };
  }

  async getGame(id: string) {
    const game = await this.findFull(id);
    return this.toDetail(game);
  }

  async setBids(gameId: string, roundNumber: number, dto: SetBidsDto) {
    const game = await this.findFull(gameId);
    if (game.status === GameStatus.COMPLETED) {
      throw new BadRequestException('Game is completed');
    }

    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }

    this.assertCurrentRoundForBids(game, roundNumber);
    this.validateBids(game, round, dto.bids);

    await this.prisma.$transaction(async (tx) => {
      for (const b of dto.bids) {
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: b.playerId },
          },
          data: { bid: b.bid, tricksTaken: null, points: null },
        });
      }
      await tx.round.update({
        where: { id: round.id },
        data: { forceBurn: dto.forceBurn === true },
      });
      await tx.game.update({
        where: { id: gameId },
        data: { status: GameStatus.PLAYING },
      });
    });

    return this.emitGame(await this.getGame(gameId));
  }

  async setTricks(gameId: string, roundNumber: number, dto: SetTricksDto) {
    const game = await this.findFull(gameId);
    if (game.status === GameStatus.COMPLETED) {
      throw new BadRequestException('Game is completed');
    }

    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }

    if (round.entries.some((e) => e.bid === null)) {
      throw new BadRequestException('All bids must be set before tricks');
    }

    this.assertCurrentRoundForTricks(game, roundNumber);
    this.validateTricks(game, round, dto.tricks);

    const totalRounds = this.rules.getTotalRounds();
    const isLast = roundNumber === totalRounds;

    await this.prisma.$transaction(async (tx) => {
      for (const t of dto.tricks) {
        const entry = round.entries.find((e) => e.playerId === t.playerId);
        if (!entry || entry.bid === null) {
          throw new BadRequestException('Missing bid for player');
        }
        const points = this.rules.scoreRound(entry.bid, t.tricksTaken);
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: t.playerId },
          },
          data: { tricksTaken: t.tricksTaken, points },
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: isLast
          ? { status: GameStatus.COMPLETED, finishedAt: new Date() }
          : { status: GameStatus.BIDDING },
      });
    });

    const detail = await this.getGame(gameId);
    if (isLast) {
      await this.tournaments.onGameCompleted(gameId);
    }
    return this.emitGame(detail);
  }

  async updateRound(gameId: string, roundNumber: number, dto: UpdateRoundDto) {
    const game = await this.findFull(gameId);
    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }

    const maxEditable = this.highestReachableRound(game);
    if (roundNumber > maxEditable) {
      throw new BadRequestException('Cannot edit a future round');
    }

    this.validateBids(game, round, dto.bids);
    this.validateTricks(game, round, dto.tricks);

    const bidByPlayer = new Map(dto.bids.map((b) => [b.playerId, b.bid]));

    await this.prisma.$transaction(async (tx) => {
      for (const t of dto.tricks) {
        const bid = bidByPlayer.get(t.playerId);
        if (bid === undefined) {
          throw new BadRequestException('Bid missing for player');
        }
        const points = this.rules.scoreRound(bid, t.tricksTaken);
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: t.playerId },
          },
          data: { bid, tricksTaken: t.tricksTaken, points },
        });
      }

      await tx.round.update({
        where: { id: round.id },
        data: { forceBurn: dto.forceBurn === true },
      });

      const refreshed = await tx.game.findUniqueOrThrow({
        where: { id: gameId },
        include: gameInclude,
      });
      const status = this.deriveStatus(refreshed);
      await tx.game.update({
        where: { id: gameId },
        data: {
          status,
          finishedAt:
            status === GameStatus.COMPLETED
              ? (refreshed.finishedAt ?? new Date())
              : null,
        },
      });
    });

    const before = game.status;
    const detail = await this.getGame(gameId);
    if (
      before !== GameStatus.COMPLETED &&
      detail.status === GameStatus.COMPLETED
    ) {
      await this.tournaments.onGameCompleted(gameId);
    }
    return this.emitGame(detail);
  }

  /** Public standings helper for tournament high-table qualification. */
  computeStandingsPublic(
    game: {
      players: {
        id: string;
        name: string;
        seatIndex: number;
        tournamentPlayerId?: string | null;
      }[];
      rounds: {
        entries: {
          playerId: string;
          points: number | null;
          bid: number | null;
          tricksTaken: number | null;
        }[];
      }[];
    },
  ) {
    return this.computeStandings(game);
  }

  private emitGame<
    T extends { id: string; tournamentId?: string | null },
  >(detail: T): T {
    this.realtime.emitGame(detail.id, detail);
    if (detail.tournamentId) {
      void this.tournaments.emitUpdate(detail.tournamentId);
    }
    return detail;
  }

  private async findFull(id: string): Promise<FullGame> {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: gameInclude,
    });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  private validateBids(
    game: FullGame,
    round: FullGame['rounds'][number],
    bids: { playerId: string; bid: number }[],
  ) {
    if (bids.length !== game.players.length) {
      throw new BadRequestException('Must include a bid for every player');
    }
    const seen = new Set<string>();
    for (const b of bids) {
      if (seen.has(b.playerId)) {
        throw new BadRequestException('Duplicate player bid');
      }
      seen.add(b.playerId);
      if (!game.players.some((p) => p.id === b.playerId)) {
        throw new BadRequestException('Unknown player in bids');
      }
      if (b.bid < 0 || b.bid > round.handSize) {
        throw new BadRequestException(
          `Bid must be 0–${round.handSize}`,
        );
      }
    }

    const order = this.rules.bidOrderSeats(round.number, game.players.length);
    const seatToPlayer = new Map(
      game.players.map((p) => [p.seatIndex, p] as const),
    );
    const bidByPlayer = new Map(bids.map((b) => [b.playerId, b.bid]));

    let running = 0;
    for (let i = 0; i < order.length; i++) {
      const player = seatToPlayer.get(order[i]);
      if (!player) {
        throw new BadRequestException('Invalid seat order');
      }
      const bid = bidByPlayer.get(player.id);
      if (bid === undefined) {
        throw new BadRequestException('Missing bid');
      }
      const isLast = i === order.length - 1;
      if (isLast) {
        const forbidden = this.rules.forbiddenLastBid(running, round.handSize);
        if (forbidden !== null && bid === forbidden) {
          throw new BadRequestException(
            `Last bidder cannot bid ${forbidden} (total would equal ${round.handSize})`,
          );
        }
      }
      running += bid;
    }
  }

  private validateTricks(
    game: FullGame,
    round: FullGame['rounds'][number],
    tricks: { playerId: string; tricksTaken: number }[],
  ) {
    if (tricks.length !== game.players.length) {
      throw new BadRequestException('Must include tricks for every player');
    }
    const seen = new Set<string>();
    let sum = 0;
    for (const t of tricks) {
      if (seen.has(t.playerId)) {
        throw new BadRequestException('Duplicate player tricks');
      }
      seen.add(t.playerId);
      if (!game.players.some((p) => p.id === t.playerId)) {
        throw new BadRequestException('Unknown player in tricks');
      }
      if (t.tricksTaken < 0 || t.tricksTaken > round.handSize) {
        throw new BadRequestException(
          `Tricks must be 0–${round.handSize}`,
        );
      }
      sum += t.tricksTaken;
    }
    if (sum !== round.handSize) {
      throw new BadRequestException(
        `Tricks must sum to ${round.handSize} (got ${sum})`,
      );
    }
  }

  private currentRoundNumber(game: FullGame): number {
    for (const round of game.rounds) {
      const incomplete = round.entries.some(
        (e) => e.bid === null || e.tricksTaken === null || e.points === null,
      );
      if (incomplete) {
        return round.number;
      }
    }
    return this.rules.getTotalRounds();
  }

  private highestReachableRound(game: FullGame): number {
    return this.currentRoundNumber(game);
  }

  private assertCurrentRoundForBids(game: FullGame, roundNumber: number) {
    const current = this.currentRoundNumber(game);
    if (roundNumber !== current) {
      throw new BadRequestException(
        `Can only set bids on current round (${current})`,
      );
    }
    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException('Round not found');
    }
    if (round.entries.every((e) => e.tricksTaken !== null)) {
      throw new BadRequestException('Round already completed; use edit');
    }
  }

  private assertCurrentRoundForTricks(game: FullGame, roundNumber: number) {
    const current = this.currentRoundNumber(game);
    if (roundNumber !== current) {
      throw new BadRequestException(
        `Can only set tricks on current round (${current})`,
      );
    }
  }

  private deriveStatus(game: FullGame): GameStatus {
    const total = this.rules.getTotalRounds();
    const allDone = game.rounds.every((r) =>
      r.entries.every(
        (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
      ),
    );
    if (allDone && game.rounds.length === total) {
      return GameStatus.COMPLETED;
    }
    const current = game.rounds.find((r) =>
      r.entries.some(
        (e) => e.bid === null || e.tricksTaken === null || e.points === null,
      ),
    );
    if (!current) {
      return GameStatus.BIDDING;
    }
    if (current.entries.every((e) => e.bid !== null)) {
      return GameStatus.PLAYING;
    }
    return GameStatus.BIDDING;
  }

  private toSummary(
    game: Prisma.GameGetPayload<{
      include: {
        players: true;
        rounds: { include: { entries: true } };
      };
    }>,
  ) {
    const standings = this.computeStandings(game);
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      playerCount: game.players.length,
      players: game.players
        .slice()
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((p) => p.name),
      standings,
      currentRound: this.summaryCurrentRound(game),
    };
  }

  private summaryCurrentRound(
    game: Prisma.GameGetPayload<{
      include: {
        players: true;
        rounds: { include: { entries: true } };
      };
    }>,
  ): number | null {
    if (game.status === GameStatus.COMPLETED) {
      return null;
    }
    for (const round of game.rounds.sort((a, b) => a.number - b.number)) {
      if (
        round.entries.some(
          (e) => e.bid === null || e.tricksTaken === null || e.points === null,
        )
      ) {
        return round.number;
      }
    }
    return null;
  }

  private toDetail(game: FullGame) {
    const standings = this.computeStandings(game);
    const currentRound = this.currentRoundNumber(game);
    const phase =
      game.status === GameStatus.COMPLETED
        ? 'completed'
        : this.roundPhase(game, currentRound);

    const rounds = game.rounds.map((round) => {
      const bidOrder = this.rules.bidOrderSeats(
        round.number,
        game.players.length,
      );
      const entriesBySeat = new Map(
        round.entries.map((e) => [e.player.seatIndex, e] as const),
      );
      const priorSum = (() => {
        let sum = 0;
        for (let i = 0; i < bidOrder.length - 1; i++) {
          const e = entriesBySeat.get(bidOrder[i]);
          if (e?.bid != null) sum += e.bid;
        }
        return sum;
      })();
      const forbiddenLast =
        round.entries.every((e) => e.bid !== null)
          ? null
          : this.rules.forbiddenLastBid(priorSum, round.handSize);

      return {
        id: round.id,
        number: round.number,
        handSize: round.handSize,
        dealerSeat: round.dealerSeat,
        forceBurn: round.forceBurn,
        dealerPlayerId: game.players.find((p) => p.seatIndex === round.dealerSeat)
          ?.id,
        bidOrderPlayerIds: bidOrder.map(
          (seat) => game.players.find((p) => p.seatIndex === seat)!.id,
        ),
        forbiddenLastBid: forbiddenLast,
        entries: game.players.map((p) => {
          const e = round.entries.find((x) => x.playerId === p.id)!;
          return {
            playerId: p.id,
            playerName: p.name,
            seatIndex: p.seatIndex,
            bid: e.bid,
            tricksTaken: e.tricksTaken,
            points: e.points,
          };
        }),
        complete: round.entries.every(
          (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
        ),
      };
    });

    return {
      id: game.id,
      name: game.name,
      status: game.status,
      phase,
      currentRound:
        game.status === GameStatus.COMPLETED ? null : currentRound,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      tournamentId: game.tournamentId,
      tournamentTableId: game.tournamentTableId,
      isHighTable: game.isHighTable,
      tableNumber: game.tableNumber,
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      })),
      rounds,
      standings,
      totals: standings.map((s) => ({
        playerId: s.playerId,
        total: s.total,
        place: s.place,
      })),
    };
  }

  private roundPhase(
    game: FullGame,
    roundNumber: number,
  ): 'bidding' | 'tricks' {
    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) return 'bidding';
    if (round.entries.every((e) => e.bid !== null)) return 'tricks';
    return 'bidding';
  }

  private computeStandings(
    game: {
      players: { id: string; name: string; seatIndex: number }[];
      rounds: {
        entries: {
          playerId: string;
          points: number | null;
          bid: number | null;
          tricksTaken: number | null;
        }[];
      }[];
    },
  ) {
    const totals = game.players.map((p) => {
      let total = 0;
      let roundsPlayed = 0;
      let made = 0;
      for (const round of game.rounds) {
        const e = round.entries.find((x) => x.playerId === p.id);
        if (e?.points != null) {
          total += e.points;
          roundsPlayed += 1;
          if (e.bid !== null && e.tricksTaken !== null && e.bid === e.tricksTaken) {
            made += 1;
          }
        }
      }
      return {
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        total,
        roundsPlayed,
        bidsMade: made,
      };
    });

    const sorted = [...totals].sort((a, b) => b.total - a.total);
    let place = 0;
    let lastScore: number | null = null;
    const withPlace = sorted.map((row, idx) => {
      if (lastScore === null || row.total !== lastScore) {
        place = idx + 1;
        lastScore = row.total;
      }
      return { ...row, place };
    });

    return withPlace.sort((a, b) => a.seatIndex - b.seatIndex);
  }
}

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
