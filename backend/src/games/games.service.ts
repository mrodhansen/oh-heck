import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GameEventType, GameStatus, PlayMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TournamentsService } from '../tournaments/tournaments.service';
import {
  CreateGameDto,
  SetBidsDto,
  SetSuperPlayDto,
  SetTricksDto,
  UpdateNotesDto,
  UpdateRoundDto,
} from './dto';
import { toInputJson, type JsonValue } from '../common/json';
import {
  cardsPlayedFromTricks,
  dealtHandsFromEntries,
  parseCurrentTrick,
  trickHistoryFromTricks,
} from './play-json';
import {
  buildSuperPlay,
  hasTrumpCard,
  parseCard,
  type SuperPlayCard,
} from './super-play';
import {
  asIntArray,
  assignPlacesByTotal,
  clearOutcomeFields,
  computeBidAnalytics,
  computeGameFinishStats,
  computeOutcome,
  cumulativeFieldsForRound,
  derivedBidAggregates,
  derivedEntryOutcome,
  entryRoles,
  eventCreate,
  roundSetupFields,
} from './analytics';
import { asNotes, hasNotes } from './notes';
import {
  ApiErrorCode,
  conflict,
  exceptionMessage,
  notFound,
} from '../common/api-error';
import { assertUsersExist } from '../common/users';
import {
  gameSeatInclude,
  seatedPlayers,
  withSeatedPlayers,
  type SeatedPlayer,
} from './seats';

const gameInclude = {
  seats: gameSeatInclude,
  tournamentTable: true,
  liveSession: { select: { code: true } },
  rounds: {
    orderBy: { number: 'asc' as const },
    include: {
      entries: {
        include: { player: true },
      },
      tricks: {
        orderBy: { trickIndex: 'asc' as const },
        include: {
          plays: { orderBy: { playOrder: 'asc' as const } },
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.GameInclude;

type FullGame = Prisma.GameGetPayload<{ include: typeof gameInclude }> & {
  players: SeatedPlayer[];
};

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => TournamentsService))
    private readonly tournaments: TournamentsService,
  ) {}

  async listGames() {
    const games = await this.prisma.game.findMany({
      where: { tournamentTableId: null, liveSession: null },
      orderBy: { createdAt: 'desc' },
        include: {
        seats: gameSeatInclude,
        rounds: {
          include: { entries: true },
        },
      },
    });
    return games.map((g) => this.toSummary(withSeatedPlayers(g)));
  }

  async createGame(
    dto: CreateGameDto,
    opts?: { fromLive?: boolean; actorUserId?: string },
  ) {
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
    const firstDealerSeat = this.rules.dealerSeat(1, playerCount);

    if (dto.playerIds && dto.playerIds.length !== names.length) {
      throw new BadRequestException('playerIds must match playerNames length');
    }
    if (dto.playerIds && new Set(dto.playerIds).size !== dto.playerIds.length) {
      throw new BadRequestException('playerIds must be unique');
    }
    const playerUserIds = sanitizePlayerUserIds(dto.playerUserIds, names.length, {
      fromLive: opts?.fromLive === true,
      actorUserId: opts?.actorUserId,
    });
    if (playerUserIds) {
      const claimed = playerUserIds.filter((id): id is string => !!id);
      if (new Set(claimed).size !== claimed.length) {
        throw new BadRequestException('playerUserIds must be unique when set');
      }
      await assertUsersExist(this.prisma, claimed);
    }

    if (dto.id) {
      const existing = await this.prisma.game.findUnique({
        where: { id: dto.id },
        include: gameInclude,
      });
      if (existing) {
        const existingNames = seatedPlayers(existing.seats).map((p) => p.name);
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
          const existingIds = seatedPlayers(existing.seats).map((p) => p.id);
          const idsMatch = existingIds.every((id, i) => id === dto.playerIds![i]);
          if (!idsMatch) {
            throw new BadRequestException(
              'Game id already exists with different player ids',
            );
          }
        }
        return await this.toDetail(withSeatedPlayers(existing));
      }
    }

    const game = await this.prisma.$transaction(async (tx) => {
      if (dto.playMode === 'ONLINE' && !opts?.fromLive) {
        throw new BadRequestException(
          'Online games can only be created by the live table',
        );
      }
      const playMode =
        dto.playMode === 'ONLINE' && opts?.fromLive === true
          ? PlayMode.ONLINE
          : PlayMode.IN_PERSON;
      if (dto.superScorer === true && playMode === PlayMode.ONLINE) {
        throw new BadRequestException(
          'Super scorer is only available for scorekeeper games',
        );
      }
      const created = await tx.game.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          name: dto.name?.trim() || defaultGameName(names),
          status: GameStatus.BIDDING,
          playMode,
          superScorer: dto.superScorer === true && playMode === PlayMode.IN_PERSON,
          playerCount,
          firstDealerSeat,
        },
      });

      const players: SeatedPlayer[] = [];
      for (let seatIndex = 0; seatIndex < names.length; seatIndex++) {
        const name = names[seatIndex]!;
        const givenId = dto.playerIds?.[seatIndex];
        const userId = playerUserIds?.[seatIndex] ?? null;
        const player = await resolveSeatedPlayer(tx, {
          givenId,
          name,
          userId,
        });
        await tx.gamePlayer.create({
          data: {
            gameId: created.id,
            playerId: player.id,
            seatIndex,
          },
        });
        players.push({
          id: player.id,
          name: player.name,
          seatIndex,
          userId: player.userId,
        });
      }

      for (let r = 1; r <= totalRounds; r++) {
        const handSize = this.rules.getHandSize(r);
        const dealerSeat = this.rules.dealerSeat(r, playerCount);
        const setup = roundSetupFields(players, dealerSeat);
        const order = setup.bidOrderSeats;

        await tx.round.create({
          data: {
            gameId: created.id,
            number: r,
            handSize,
            dealerSeat,
            firstBidderSeat: setup.firstBidderSeat,
            dealerPlayerId: setup.dealerPlayerId,
            firstBidderPlayerId: setup.firstBidderPlayerId,
            bidOrderSeats: order,
            entries: {
              create: players.map((p) => {
                const roles = entryRoles(p.seatIndex, dealerSeat, order);
                return {
                  playerId: p.id,
                  bidPosition: roles.bidPosition,
                  isDealer: roles.isDealer,
                  isFirstBidder: roles.isFirstBidder,
                  isLastBidder: roles.isLastBidder,
                };
              }),
            },
          },
        });
      }

      await tx.gameEvent.create({
        data: eventCreate({
          gameId: created.id,
          type: GameEventType.GAME_CREATED,
          payload: {
            name: created.name,
            playMode,
            superScorer: created.superScorer,
            playerCount,
            firstDealerSeat,
            playerNames: names,
            playerIds: players.map((p) => p.id),
            seatOrder: players.map((p) => ({
              playerId: p.id,
              name: p.name,
              seatIndex: p.seatIndex,
            })),
          },
        }),
      });

      return tx.game.findUniqueOrThrow({
        where: { id: created.id },
        include: gameInclude,
      });
    });

    return this.emitGame(await this.toDetail(withSeatedPlayers(game)));
  }

  async syncOperations(
    operations: {
      type:
        | 'createGame'
        | 'setBids'
        | 'setTricks'
        | 'updateRound'
        | 'updateNotes'
        | 'setSuperPlay';
      payload: object;
    }[],
  ) {
    const { plainToInstance } = await import('class-transformer');
    const { validateOrReject } = await import('class-validator');
    type SyncResult =
      | { ok: true; type: string; data: object }
      | { ok: false; type: string; error: string };
    const results: SyncResult[] = [];

    for (const op of operations) {
      try {
        let data: object;
        const payload = op.payload;
        switch (op.type) {
          case 'createGame': {
            const dto = plainToInstance(CreateGameDto, payload);
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.createGame(dto);
            break;
          }
          case 'setBids': {
            const gameId = fieldString(payload, 'gameId');
            const roundNumber = fieldNumber(payload, 'roundNumber');
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid setBids payload');
            }
            const dto = plainToInstance(SetBidsDto, {
              bids: fieldValue(payload, 'bids'),
              forceBurn: fieldValue(payload, 'forceBurn'),
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.setBids(gameId, roundNumber, dto);
            break;
          }
          case 'setTricks': {
            const gameId = fieldString(payload, 'gameId');
            const roundNumber = fieldNumber(payload, 'roundNumber');
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid setTricks payload');
            }
            const dto = plainToInstance(SetTricksDto, {
              tricks: fieldValue(payload, 'tricks'),
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.setTricks(gameId, roundNumber, dto);
            break;
          }
          case 'updateRound': {
            const gameId = fieldString(payload, 'gameId');
            const roundNumber = fieldNumber(payload, 'roundNumber');
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid updateRound payload');
            }
            const dto = plainToInstance(UpdateRoundDto, {
              bids: fieldValue(payload, 'bids'),
              tricks: fieldValue(payload, 'tricks'),
              forceBurn: fieldValue(payload, 'forceBurn'),
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.updateRound(gameId, roundNumber, dto);
            break;
          }
          case 'updateNotes': {
            const gameId = fieldString(payload, 'gameId');
            if (!gameId) {
              throw new BadRequestException('Invalid updateNotes payload');
            }
            const dto = plainToInstance(UpdateNotesDto, {
              notes: fieldValue(payload, 'notes'),
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.updateNotes(gameId, dto);
            break;
          }
          case 'setSuperPlay': {
            const gameId = fieldString(payload, 'gameId');
            const roundNumber = fieldNumber(payload, 'roundNumber');
            if (!gameId || !Number.isInteger(roundNumber)) {
              throw new BadRequestException('Invalid setSuperPlay payload');
            }
            const dto = plainToInstance(SetSuperPlayDto, {
              trumpCard: fieldValue(payload, 'trumpCard'),
              plays: fieldValue(payload, 'plays'),
            });
            await validateOrReject(dto, {
              whitelist: true,
              forbidNonWhitelisted: true,
            });
            data = await this.setSuperPlay(gameId, roundNumber, dto);
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
    return await this.toDetail(game);
  }

  async setBids(
    gameId: string,
    roundNumber: number,
    dto: SetBidsDto,
    opts?: { fromLive?: boolean },
  ) {
    const game = await this.findFull(gameId);
    this.assertClientMayMutate(game, opts?.fromLive === true);
    if (game.status === GameStatus.COMPLETED) {
      throw new BadRequestException('Game is completed');
    }
    if (game.tournamentTable && !game.tournamentTable.isHighTable) {
      await this.tournaments.assertPrelimEditable(
        game.tournamentTable.tournamentId,
      );
    }

    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }

    this.assertCurrentRoundForBids(game, roundNumber);
    if (game.superScorer && !hasTrumpCard(round.trumpCard)) {
      throw new BadRequestException('Trump must be set before bidding');
    }
    this.validateBids(game, round, dto.bids);

    const players = game.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
    }));
    const analytics = computeBidAnalytics(
      players,
      round.dealerSeat,
      round.handSize,
      dto.bids,
      (prior, hand) => this.rules.forbiddenLastBid(prior, hand),
    );
    const now = new Date();
    const forceBurn = dto.forceBurn === true;
    const bidOrder = dto.bids
      .map((b) => {
        const a = analytics.perPlayer.get(b.playerId)!;
        return {
          playerId: b.playerId,
          bid: b.bid,
          bidPosition: a.bidPosition,
          runningBidBefore: a.runningBidBefore,
          isDealer: a.isDealer,
          isLastBidder: a.isLastBidder,
        };
      })
      .sort((a, b) => a.bidPosition - b.bidPosition);

    await this.prisma.$transaction(async (tx) => {
      for (const b of dto.bids) {
        const a = analytics.perPlayer.get(b.playerId)!;
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: b.playerId },
          },
          data: {
            bid: b.bid,
            ...clearOutcomeFields(),
            bidPosition: a.bidPosition,
            isDealer: a.isDealer,
            isFirstBidder: a.isFirstBidder,
            isLastBidder: a.isLastBidder,
            runningBidBefore: a.runningBidBefore,
          },
        });
      }

      await tx.round.update({
        where: { id: round.id },
        data: {
          forceBurn,
          bidsCompletedAt: round.bidsCompletedAt ?? now,
          tricksCompletedAt: null,
          completedAt: null,
        },
      });

      await tx.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.PLAYING,
          startedAt: game.startedAt ?? now,
          finishedAt: null,
        },
      });

      await tx.gameEvent.create({
        data: eventCreate({
          gameId,
          type: GameEventType.BIDS_SET,
          payload: {
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
            bids: bidOrder,
          },
          roundNumber,
        }),
      });
    });

    return this.emitGame(await this.getGame(gameId));
  }

  async setTricks(
    gameId: string,
    roundNumber: number,
    dto: SetTricksDto,
    opts?: { fromLive?: boolean },
  ) {
    const game = await this.findFull(gameId);
    this.assertClientMayMutate(game, opts?.fromLive === true);
    if (game.status === GameStatus.COMPLETED) {
      throw new BadRequestException('Game is completed');
    }
    if (game.tournamentTable && !game.tournamentTable.isHighTable) {
      await this.tournaments.assertPrelimEditable(
        game.tournamentTable.tournamentId,
      );
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
    const now = new Date();
    const players = game.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
    }));

    const outcomes = new Map<
      string,
      ReturnType<typeof computeOutcome> & { tricksTaken: number; bid: number }
    >();
    for (const t of dto.tricks) {
      const entry = round.entries.find((e) => e.playerId === t.playerId);
      if (!entry || entry.bid === null) {
        throw new BadRequestException('Missing bid for player');
      }
      outcomes.set(t.playerId, {
        ...computeOutcome(entry.bid, t.tricksTaken, (b, tr) =>
          this.rules.scoreRound(b, tr),
        ),
        tricksTaken: t.tricksTaken,
        bid: entry.bid,
      });
    }

    // Build snapshot rounds for cumulative calc (this round with new points)
    const roundsSnap = game.rounds.map((r) => ({
      number: r.number,
      forceBurn: r.forceBurn,
      entries: r.entries.map((e) => {
        if (r.number !== roundNumber) {
          return {
            playerId: e.playerId,
            bid: e.bid,
            tricksTaken: e.tricksTaken,
            points: e.points,
          };
        }
        const o = outcomes.get(e.playerId)!;
        return {
          playerId: e.playerId,
          bid: o.bid,
          tricksTaken: o.tricksTaken,
          points: o.points,
        };
      }),
    }));
    const cum = cumulativeFieldsForRound(players, roundsSnap, roundNumber);

    const trickOrder = [...dto.tricks]
      .map((t) => {
        const e = round.entries.find((x) => x.playerId === t.playerId)!;
        return {
          playerId: t.playerId,
          bid: e.bid,
          tricksTaken: t.tricksTaken,
          points: outcomes.get(t.playerId)!.points,
          made: outcomes.get(t.playerId)!.made,
          trickDelta: outcomes.get(t.playerId)!.trickDelta,
          bidPosition: e.bidPosition,
        };
      })
      .sort((a, b) => {
        if (a.bidPosition == null || b.bidPosition == null) {
          throw new BadRequestException('Missing bidPosition for event payload');
        }
        return a.bidPosition - b.bidPosition;
      });

    await this.prisma.$transaction(async (tx) => {
      for (const t of dto.tricks) {
        const o = outcomes.get(t.playerId)!;
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: t.playerId },
          },
          data: {
            tricksTaken: t.tricksTaken,
            points: o.points,
          },
        });
      }

      await tx.round.update({
        where: { id: round.id },
        data: {
          tricksCompletedAt: now,
          completedAt: now,
        },
      });

      const finish = isLast
        ? computeGameFinishStats(
            players,
            roundsSnap,
            game.createdAt,
            now,
          )
        : null;

      await tx.game.update({
        where: { id: gameId },
        data: isLast
          ? {
              status: GameStatus.COMPLETED,
              finishedAt: now,
            }
          : { status: GameStatus.BIDDING },
      });

      await tx.gameEvent.create({
        data: eventCreate({
          gameId,
          type: GameEventType.TRICKS_SET,
          payload: {
            roundNumber,
            handSize: round.handSize,
            bidSum: derivedBidAggregates(
              round.handSize,
              round.entries.map((e) => e.bid),
            ).bidSum,
            forceBurn: round.forceBurn,
            tricks: trickOrder,
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
        }),
      });
    });

    if (isLast) {
      try {
        await this.tournaments.onGameCompleted(gameId);
      } catch (e) {
        // Score already committed; recovery via GET tryFinalize*
        this.logger.error(
          `onGameCompleted after setTricks ${gameId}: ${exceptionMessage(e)}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
    }
    return this.emitGame(await this.getGame(gameId));
  }

  async setSuperPlay(
    gameId: string,
    roundNumber: number,
    dto: SetSuperPlayDto,
  ) {
    const game = await this.findFull(gameId);
    this.assertClientMayMutate(game, false);
    if (game.playMode !== PlayMode.IN_PERSON) {
      throw new BadRequestException(
        'Super scorer is only available for scorekeeper games',
      );
    }
    if (!game.superScorer) {
      throw new BadRequestException('This game is not in super scorer mode');
    }
    if (game.status === GameStatus.COMPLETED) {
      throw new BadRequestException('Game is completed');
    }
    if (game.tournamentTable && !game.tournamentTable.isHighTable) {
      await this.tournaments.assertPrelimEditable(
        game.tournamentTable.tournamentId,
      );
    }

    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }
    const bidsIn = round.entries.every((e) => e.bid !== null);
    const trumpOnly = dto.plays.length === 0;
    if (!bidsIn && !trumpOnly) {
      throw new BadRequestException('All bids must be set before play');
    }
    if (bidsIn) {
      this.assertCurrentRoundForTricks(game, roundNumber);
    } else {
      this.assertCurrentRoundForBids(game, roundNumber);
    }

    const trumpCard =
      dto.trumpCard == null ? null : parseCard(dto.trumpCard.s, dto.trumpCard.r);
    const plays: SuperPlayCard[] = dto.plays.map((p) => {
      const card = parseCard(p.card.s, p.card.r);
      return { playerId: p.playerId, s: card.s, r: card.r };
    });

    let view;
    try {
      view = buildSuperPlay({
        playerCount: game.players.length,
        firstLeadSeat: round.firstBidderSeat,
        handSize: round.handSize,
        players: game.players.map((p) => ({
          id: p.id,
          seatIndex: p.seatIndex,
        })),
        trumpCard,
        plays,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid play',
      );
    }

    const currentTrickJson: JsonValue | null = view.current
      ? {
          leadSeat: view.current.leadSeat,
          plays: view.current.plays.map((p) => ({
            playOrder: p.playOrder,
            seatIndex: p.seatIndex,
            playerId: p.playerId,
            s: p.s,
            r: p.r,
            key: p.key,
            followedSuit: p.followedSuit,
            playedTrump: p.playedTrump,
          })),
        }
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.trick.deleteMany({ where: { roundId: round.id } });

      await tx.round.update({
        where: { id: round.id },
        data: {
          trumpSuit: view.trumpCard?.s ?? null,
          trumpCard: view.trumpCard
            ? toInputJson({ s: view.trumpCard.s, r: view.trumpCard.r })
            : Prisma.JsonNull,
          currentTrick:
            currentTrickJson == null
              ? Prisma.JsonNull
              : toInputJson(currentTrickJson),
        },
      });

      for (const trick of view.completed) {
        await tx.trick.create({
          data: {
            gameId,
            roundId: round.id,
            trickIndex: trick.trickIndex,
            leadSeat: trick.leadSeat,
            leadSuit: trick.leadSuit,
            winnerSeat: trick.winnerSeat,
            winnerPlayerId: trick.winnerPlayerId,
            plays: {
              create: trick.plays.map((p) => ({
                playOrder: p.playOrder,
                seatIndex: p.seatIndex,
                playerId: p.playerId,
                cardSuit: p.card.s,
                cardRank: p.card.r,
                cardKey: p.card.key,
                followedSuit: p.followedSuit,
                playedTrump: p.playedTrump,
              })),
            },
          },
        });
      }

      await tx.gameEvent.create({
        data: eventCreate({
          gameId,
          type:
            view.completed.length > 0 &&
            dto.plays.length === view.completed.length * game.players.length
              ? GameEventType.TRICK_COMPLETED
              : GameEventType.CARD_PLAYED,
          payload: {
            roundNumber,
            trumpCard: view.trumpCard
              ? { s: view.trumpCard.s, r: view.trumpCard.r }
              : null,
            playCount: dto.plays.length,
            tricksCompleted: view.completed.length,
            turnPlayerId: view.turnPlayerId,
            roundComplete: view.roundComplete,
          },
          roundNumber,
        }),
      });
    });

    if (view.roundComplete) {
      const tricks = game.players.map((p) => ({
        playerId: p.id,
        tricksTaken: view.tricksTakenByPlayerId[p.id] ?? 0,
      }));
      return this.setTricks(gameId, roundNumber, { tricks });
    }

    return this.emitGame(await this.getGame(gameId));
  }

  async updateRound(
    gameId: string,
    roundNumber: number,
    dto: UpdateRoundDto,
    opts?: { fromLive?: boolean },
  ) {
    const game = await this.findFull(gameId);
    this.assertClientMayMutate(game, opts?.fromLive === true);
    const round = game.rounds.find((r) => r.number === roundNumber);
    if (!round) {
      throw new NotFoundException(`Round ${roundNumber} not found`);
    }

    if (game.tournamentTable && !game.tournamentTable.isHighTable) {
      await this.tournaments.assertPrelimEditable(
        game.tournamentTable.tournamentId,
      );
    }

    const maxEditable = this.currentRoundNumber(game);
    if (roundNumber > maxEditable) {
      throw new BadRequestException('Cannot edit a future round');
    }

    this.validateBids(game, round, dto.bids);
    this.validateTricks(game, round, dto.tricks);

    const players = game.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
    }));
    const bidAnalytics = computeBidAnalytics(
      players,
      round.dealerSeat,
      round.handSize,
      dto.bids,
      (prior, hand) => this.rules.forbiddenLastBid(prior, hand),
    );
    const bidByPlayer = new Map(dto.bids.map((b) => [b.playerId, b.bid]));
    const now = new Date();
    const forceBurn = dto.forceBurn === true;

    const before = {
      forceBurn: round.forceBurn,
      entries: round.entries.map((e) => ({
        playerId: e.playerId,
        bid: e.bid,
        tricksTaken: e.tricksTaken,
        points: e.points,
      })),
    };

    const outcomes = new Map<
      string,
      ReturnType<typeof computeOutcome> & { tricksTaken: number; bid: number }
    >();
    for (const t of dto.tricks) {
      const bid = bidByPlayer.get(t.playerId);
      if (bid === undefined) {
        throw new BadRequestException('Bid missing for player');
      }
      outcomes.set(t.playerId, {
        ...computeOutcome(bid, t.tricksTaken, (b, tr) =>
          this.rules.scoreRound(b, tr),
        ),
        tricksTaken: t.tricksTaken,
        bid,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const t of dto.tricks) {
        const o = outcomes.get(t.playerId)!;
        const a = bidAnalytics.perPlayer.get(t.playerId)!;
        await tx.roundEntry.update({
          where: {
            roundId_playerId: { roundId: round.id, playerId: t.playerId },
          },
          data: {
            bid: o.bid,
            tricksTaken: o.tricksTaken,
            points: o.points,
            bidPosition: a.bidPosition,
            isDealer: a.isDealer,
            isFirstBidder: a.isFirstBidder,
            isLastBidder: a.isLastBidder,
            runningBidBefore: a.runningBidBefore,
          },
        });
      }

      await tx.trick.deleteMany({ where: { roundId: round.id } });
      await tx.round.update({
        where: { id: round.id },
        data: {
          forceBurn,
          bidsCompletedAt: round.bidsCompletedAt ?? now,
          tricksCompletedAt: round.tricksCompletedAt ?? now,
          completedAt: round.completedAt ?? now,
          editCount: { increment: 1 },
          trumpSuit: null,
          trumpCard: Prisma.JsonNull,
          currentTrick: Prisma.JsonNull,
        },
      });

      const refreshed = await tx.game.findUniqueOrThrow({
        where: { id: gameId },
        include: gameInclude,
      });
      const status = this.deriveStatus(refreshed);
      const allComplete = status === GameStatus.COMPLETED;
      const finishedAt = allComplete
        ? (refreshed.finishedAt ?? now)
        : null;

      await tx.game.update({
        where: { id: gameId },
        data: {
          status,
          finishedAt,
        },
      });

      await tx.gameEvent.create({
        data: eventCreate({
          gameId,
          type: GameEventType.ROUND_UPDATED,
          payload: {
            roundNumber,
            before,
            after: {
              forceBurn,
              bidSum: bidAnalytics.bidSum,
              bidDeficit: bidAnalytics.bidDeficit,
              forbiddenLastBid: bidAnalytics.forbiddenLastBid,
              entries: dto.tricks.map((t) => {
                const o = outcomes.get(t.playerId)!;
                return {
                  playerId: t.playerId,
                  bid: o.bid,
                  tricksTaken: o.tricksTaken,
                  points: o.points,
                  made: o.made,
                  trickDelta: o.trickDelta,
                };
              }),
            },
          },
          roundNumber,
        }),
      });
    });

    const beforeStatus = game.status;
    let detail = await this.getGame(gameId);
    if (
      beforeStatus !== GameStatus.COMPLETED &&
      detail.status === GameStatus.COMPLETED
    ) {
      try {
        await this.tournaments.onGameCompleted(gameId);
      } catch (e) {
        this.logger.error(
          `onGameCompleted after updateRound ${gameId}: ${exceptionMessage(e)}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
      detail = await this.getGame(gameId);
    }
    return this.emitGame(detail);
  }

  async updateNotes(gameId: string, dto: UpdateNotesDto) {
    const game = await this.findFull(gameId);
    if (game.playMode === PlayMode.ONLINE) {
      throw new BadRequestException(
        'Notes are only available on scorekeeper games',
      );
    }

    const now = new Date().toISOString();
    const notes = dto.notes.map((n) => ({
      id: n.id,
      text: n.text.trim(),
      createdAt: n.createdAt || now,
      updatedAt: n.updatedAt || now,
    }));
    const ids = new Set(notes.map((n) => n.id));
    if (ids.size !== notes.length) {
      throw new BadRequestException('Note ids must be unique');
    }
    if (notes.some((n) => n.text.length === 0)) {
      throw new BadRequestException('Note text cannot be empty');
    }

    await this.prisma.game.update({
      where: { id: gameId },
      data: { notes },
    });

    return this.emitGame(await this.getGame(gameId));
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
      throw notFound(ApiErrorCode.GAME_NOT_FOUND, 'Game not found');
    }
    return withSeatedPlayers(game);
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

    const storedOrder = asIntArray(round.bidOrderSeats);
    const order =
      storedOrder.length === game.players.length
        ? storedOrder
        : this.rules.bidOrderSeats(round.number, game.players.length);
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

  private deriveStatus(game: {
    rounds: {
      entries: {
        bid: number | null;
        tricksTaken: number | null;
        points: number | null;
      }[];
    }[];
  }): GameStatus {
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
    game: {
      players: SeatedPlayer[];
      rounds: {
        number: number;
        entries: {
          playerId: string;
          points: number | null;
          bid: number | null;
          tricksTaken: number | null;
        }[];
      }[];
    } & {
      id: string;
      name: string | null;
      notes: Prisma.JsonValue;
      status: GameStatus;
      playMode: PlayMode;
      superScorer: boolean;
      liveCode?: string | null;
      createdAt: Date;
      finishedAt: Date | null;
    },
  ) {
    const standings = this.computeStandings(game);
    return {
      id: game.id,
      name: game.name,
      hasNotes: hasNotes(game.notes),
      status: game.status,
      playMode: game.playMode,
      superScorer: game.superScorer,
      liveCode: null,
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

  private summaryCurrentRound(game: {
    status: GameStatus;
    rounds: {
      number: number;
      entries: {
        bid: number | null;
        tricksTaken: number | null;
        points: number | null;
      }[];
    }[];
  }): number | null {
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

  /** ONLINE live games are mutated only by LiveService (fromLive: true). */
  private assertClientMayMutate(
    game: { playMode: PlayMode },
    fromLive: boolean,
  ) {
    if (game.playMode === PlayMode.ONLINE && !fromLive) {
      throw new BadRequestException(
        'Online live games can only be scored by the live table',
      );
    }
  }

  private async toDetail(game: FullGame) {
    const prelimEditsLocked =
      game.tournamentTable && !game.tournamentTable.isHighTable
        ? await this.tournaments.isPrelimEditsLocked(
            game.tournamentTable.tournamentId,
          )
        : false;
    const base = this.toDetailSync(game);
    return { ...base, prelimEditsLocked };
  }

  private toDetailSync(game: FullGame) {
    /** Hide private card data for in-progress ONLINE games (hands leak via Board API). */
    const redactPrivateCards =
      game.playMode === PlayMode.ONLINE &&
      game.status !== GameStatus.COMPLETED;
    const standings = this.computeStandings(game);
    const currentRound = this.currentRoundNumber(game);
    const phase =
      game.status === GameStatus.COMPLETED
        ? 'completed'
        : this.roundPhase(game, currentRound);

    const playersForCalc = game.players.map((p) => ({
      id: p.id,
      seatIndex: p.seatIndex,
    }));
    const roundsSnap = game.rounds.map((r) => ({
      number: r.number,
      forceBurn: r.forceBurn,
      entries: r.entries.map((e) => ({
        playerId: e.playerId,
        points: e.points,
      })),
    }));
    const allPointsPresent = game.rounds.every((r) =>
      r.entries.every((e) => e.points !== null),
    );
    const finish =
      game.status === GameStatus.COMPLETED &&
      game.finishedAt &&
      allPointsPresent
        ? computeGameFinishStats(
            playersForCalc,
            roundsSnap,
            game.createdAt,
            game.finishedAt,
          )
        : null;

    const rounds = game.rounds.map((round) => {
      const storedOrder = asIntArray(round.bidOrderSeats);
      const bidOrder =
        storedOrder.length === game.players.length
          ? storedOrder
          : this.rules.bidOrderSeats(round.number, game.players.length);
      const entriesBySeat = new Map(
        round.entries.map((e) => {
          const seat = game.players.find((p) => p.id === e.playerId);
          if (!seat) {
            throw new BadRequestException('Round entry missing seat');
          }
          return [seat.seatIndex, e] as const;
        }),
      );
      const priorSum = (() => {
        let sum = 0;
        for (let i = 0; i < bidOrder.length - 1; i++) {
          const e = entriesBySeat.get(bidOrder[i]);
          if (e?.bid != null) sum += e.bid;
        }
        return sum;
      })();
      const liveForbidden = this.rules.forbiddenLastBid(
        priorSum,
        round.handSize,
      );
      const { bidSum, bidDeficit } = derivedBidAggregates(
        round.handSize,
        round.entries.map((e) => e.bid),
      );
      const roundComplete = round.entries.every(
        (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
      );
      const cum = roundComplete
        ? cumulativeFieldsForRound(playersForCalc, roundsSnap, round.number)
        : null;

      const tricks =
        'tricks' in round && Array.isArray(round.tricks)
          ? round.tricks.map((t) => ({
              id: t.id,
              trickIndex: t.trickIndex,
              leadSeat: t.leadSeat,
              leadSuit: t.leadSuit,
              winnerSeat: t.winnerSeat,
              winnerPlayerId: t.winnerPlayerId,
              completedAt: t.completedAt,
              plays: t.plays.map((p) => ({
                playOrder: p.playOrder,
                seatIndex: p.seatIndex,
                playerId: p.playerId,
                cardSuit: p.cardSuit,
                cardRank: p.cardRank,
                cardKey: p.cardKey,
                followedSuit: p.followedSuit,
                playedTrump: p.playedTrump,
                playedAt: p.playedAt,
              })),
            }))
          : [];

      return {
        id: round.id,
        number: round.number,
        handSize: round.handSize,
        dealerSeat: round.dealerSeat,
        firstBidderSeat: round.firstBidderSeat,
        forceBurn: round.forceBurn,
        dealerPlayerId:
          round.dealerPlayerId ??
          game.players.find((p) => p.seatIndex === round.dealerSeat)?.id,
        firstBidderPlayerId:
          round.firstBidderPlayerId ??
          game.players.find((p) => p.seatIndex === round.firstBidderSeat)?.id,
        bidOrderSeats: bidOrder,
        bidOrderPlayerIds: bidOrder.map(
          (seat) => game.players.find((p) => p.seatIndex === seat)!.id,
        ),
        bidSum,
        bidDeficit,
        forbiddenLastBid: liveForbidden ?? null,
        bidsCompletedAt: round.bidsCompletedAt,
        tricksCompletedAt: round.tricksCompletedAt,
        completedAt: round.completedAt,
        editCount: round.editCount,
        trumpSuit: round.trumpSuit ?? null,
        trumpCard: redactPrivateCards ? null : (round.trumpCard ?? null),
        dealtHands: redactPrivateCards
          ? null
          : dealtHandsFromEntries(game.players, round.entries),
        dealtAt: round.dealtAt ?? null,
        trickHistory: redactPrivateCards
          ? null
          : trickHistoryFromTricks(tricks),
        currentTrick: redactPrivateCards ? null : (round.currentTrick ?? null),
        tricks: redactPrivateCards ? [] : tricks,
        entries: game.players.map((p) => {
          const e = round.entries.find((x) => x.playerId === p.id)!;
          const outcome = derivedEntryOutcome(e.bid, e.tricksTaken);
          const standing = cum?.get(p.id);
          return {
            playerId: p.id,
            playerName: p.name,
            seatIndex: p.seatIndex,
            bid: e.bid,
            tricksTaken: e.tricksTaken,
            points: e.points,
            bidPosition: e.bidPosition,
            isDealer: e.isDealer,
            isFirstBidder: e.isFirstBidder,
            isLastBidder: e.isLastBidder,
            runningBidBefore: e.runningBidBefore,
            made: outcome.made,
            trickDelta: outcome.trickDelta,
            absDelta: outcome.absDelta,
            isNilBid: outcome.isNilBid,
            isNilMade: outcome.isNilMade,
            cumulativeScore: standing?.cumulativeScore ?? null,
            placeAfterRound: standing?.placeAfterRound ?? null,
            scoreBehindLeader: standing?.scoreBehindLeader ?? null,
            bidPlacedAt: e.bidPlacedAt ?? null,
            dealtHand: redactPrivateCards ? null : (e.dealtHand ?? null),
            cardsPlayed: redactPrivateCards
              ? null
              : cardsPlayedFromTricks(
                  p.id,
                  tricks,
                  parseCurrentTrick(round.currentTrick),
                ),
          };
        }),
        complete: round.entries.every(
          (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
        ),
      };
    });

    const events = game.events.map((ev) => {
      const payload =
        redactPrivateCards &&
        (ev.type === GameEventType.ROUND_DEALT ||
          ev.type === GameEventType.CARD_PLAYED ||
          ev.type === GameEventType.TRICK_COMPLETED)
          ? { redacted: true as const, type: ev.type }
          : ev.payload;
      return {
        id: ev.id,
        type: ev.type,
        roundNumber: ev.roundNumber,
        payload,
        createdAt: ev.createdAt,
      };
    });

    return {
      id: game.id,
      name: game.name,
      notes: game.playMode === PlayMode.ONLINE ? [] : asNotes(game.notes),
      status: game.status,
      playMode: game.playMode,
      superScorer: game.superScorer,
      // Never expose join code on public Board API (seat-stealing)
      liveCode: null,
      phase,
      currentRound:
        game.status === GameStatus.COMPLETED ? null : currentRound,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      durationMs:
        finish?.durationMs ??
        (game.finishedAt
          ? Math.max(
              0,
              game.finishedAt.getTime() - game.createdAt.getTime(),
            )
          : null),
      playerCount: game.players.length,
      firstDealerSeat: game.firstDealerSeat,
      winnerPlayerId: finish?.winnerPlayerId ?? null,
      winnerScore: finish?.winnerScore ?? null,
      runnerUpScore: finish?.runnerUpScore ?? null,
      winMargin: finish?.winMargin ?? null,
      totalForceBurns:
        finish?.totalForceBurns ??
        game.rounds.filter((r) => r.forceBurn).length,
      totalEdits: game.rounds.reduce((s, r) => s + r.editCount, 0),
      tournamentId: game.tournamentTable?.tournamentId ?? null,
      tournamentTableId: game.tournamentTableId,
      isHighTable: game.tournamentTable?.isHighTable ?? false,
      tableNumber: game.tournamentTable?.tableNumber ?? null,
      prelimEditsLocked: false as boolean,
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        userId: p.userId ?? null,
      })),
      rounds,
      standings,
      events,
    };
  }

  async claimPlayer(gameId: string, playerId: string, userId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { seats: gameSeatInclude },
    });
    if (!game) throw notFound(ApiErrorCode.GAME_NOT_FOUND, 'Game not found');
    const players = seatedPlayers(game.seats);

    const target = players.find((p) => p.id === playerId);
    if (!target) throw new BadRequestException('Player not found in game');
    if (target.userId) {
      if (target.userId === userId) {
        return this.getGame(gameId);
      }
      throw new BadRequestException('That seat is already claimed');
    }
    const mine = players.find((p) => p.userId === userId);
    if (mine) {
      throw new BadRequestException(
        `You already claimed ${mine.name} in this game`,
      );
    }

    const existing = await this.prisma.player.findUnique({
      where: { userId },
    });
    if (existing && existing.id !== playerId) {
      const seat = game.seats.find((s) => s.playerId === playerId);
      if (!seat) throw new BadRequestException('Player not found in game');
      await this.prisma.$transaction(async (tx) => {
        await tx.gamePlayer.update({
          where: { id: seat.id },
          data: { playerId: existing.id },
        });
        await tx.roundEntry.updateMany({
          where: { playerId, round: { gameId } },
          data: { playerId: existing.id },
        });
        await tx.trickPlay.updateMany({
          where: { playerId, trick: { gameId } },
          data: { playerId: existing.id },
        });
        await tx.trick.updateMany({
          where: { winnerPlayerId: playerId, gameId },
          data: { winnerPlayerId: existing.id },
        });
      });
    } else if (!existing) {
      await this.prisma.player.update({
        where: { id: playerId },
        data: { userId },
      });
    }
    return this.getGame(gameId);
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

    return assignPlacesByTotal(totals).sort((a, b) => a.seatIndex - b.seatIndex);
  }
}

async function resolveSeatedPlayer(
  tx: Prisma.TransactionClient,
  args: { givenId?: string; name: string; userId: string | null },
): Promise<{ id: string; name: string; userId: string | null }> {
  const { givenId, name, userId } = args;
  const byId =
    givenId != null
      ? await tx.player.findUnique({ where: { id: givenId } })
      : null;
  if (byId) {
    if (userId && byId.userId && byId.userId !== userId) {
      throw conflict('Player id is already bound to a different user');
    }
    if (userId && !byId.userId) {
      return tx.player.update({
        where: { id: byId.id },
        data: { userId },
      });
    }
    return byId;
  }
  if (userId) {
    const byUser = await tx.player.findUnique({ where: { userId } });
    if (byUser) return byUser;
  }
  return tx.player.create({
    data: {
      ...(givenId != null ? { id: givenId } : {}),
      name,
      ...(userId ? { userId } : {}),
    },
  });
}

function sanitizePlayerUserIds(
  raw: (string | null)[] | undefined,
  length: number,
  opts: { fromLive: boolean; actorUserId?: string },
): (string | null)[] | undefined {
  if (!raw) return undefined;
  if (raw.length !== length) {
    throw new BadRequestException(
      'playerUserIds must match playerNames length',
    );
  }
  if (opts.fromLive) return raw;
  if (!opts.actorUserId) return undefined;
  return raw.map((id) => (id === opts.actorUserId ? id : null));
}

function fieldValue(obj: object, key: string): unknown {
  return key in obj ? (obj as { [k: string]: unknown })[key] : undefined;
}

function fieldString(obj: object, key: string): string {
  const v = fieldValue(obj, key);
  return typeof v === 'string' ? v : '';
}

function fieldNumber(obj: object, key: string): number {
  const v = fieldValue(obj, key);
  return typeof v === 'number' ? v : Number.NaN;
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
