import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GameEventType, LiveSessionStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GamesService } from '../games/games.service';
import {
  currentBidderSeat,
  dealRound,
  emptyLobbyState,
  engineFromScorecard,
  EngineState,
  placeBid,
  playCard,
  roundHasDeal,
  tablePlays,
} from './engine';
import { Card, cardKey, legalPlays, Suit } from './cards';
import {
  persistBidPlaced,
  persistCardPlay,
  persistCompletedTrick,
  persistCurrentTrick,
  persistDeal,
  logEvent,
} from './telemetry';
import { resolveExistingUserId } from '../common/users';
import { toInputJson } from '../common/json';
import { parseLobby, type LobbySeat } from './lobby';
import { gameSeatInclude, seatedPlayers } from '../games/seats';

const CODE_DIGITS = 4;
const CODE_MIN = 1000;
const CODE_SPAN = 9000;

type SessionWithPlayers = Prisma.LiveSessionGetPayload<
  Record<string, never>
> & { players: LobbySeat[] };

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly realtime: RealtimeGateway,
    private readonly games: GamesService,
  ) {}

  async create(name: string, userId?: string | null) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name required');
    const linkedUserId = await resolveExistingUserId(this.prisma, userId);

    const token = newToken();
    let session: SessionWithPlayers | null = null;
    for (let attempt = 0; attempt < 3 && !session; attempt++) {
      const code = await this.allocCode();
      try {
        const hostSeat: LobbySeat = {
          id: randomBytes(16).toString('hex'),
          name: trimmed,
          token,
          seatIndex: 0,
          isHost: true,
          gone: false,
          userId: linkedUserId ?? null,
        };
        const created = await this.prisma.liveSession.create({
          data: {
            code,
            status: LiveSessionStatus.LOBBY,
            lobby: toInputJson([hostSeat]),
          },
        });
        session = { ...created, players: [hostSeat] };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 2
        ) {
          continue;
        }
        throw e;
      }
    }
    if (!session) {
      throw new BadRequestException('Could not allocate game code');
    }

    const host = session.players[0]!;
    await this.prisma.liveSession.update({
      where: { id: session.id },
      data: { hostPlayerId: host.id },
    });
    session.hostPlayerId = host.id;

    await logEvent(this.prisma, {
      sessionId: session.id,
      type: GameEventType.SESSION_CREATED,
      playerId: host.id,
      payload: { code: session.code, hostName: host.name },
    });

    const view = await this.toView(session, host.id);
    this.emitSession(session.id);
    return { ...view, token, playerId: host.id };
  }

  async join(codeRaw: string, name: string, userId?: string | null) {
    const code = normalizeCode(codeRaw);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name required');
    const linkedUserId = await resolveExistingUserId(this.prisma, userId);

    const token = newToken();
    const limits = this.rules.getPlayerLimits();

    const player = await this.prisma.$transaction(async (tx) => {
      const session = await tx.liveSession.findUnique({
        where: { code },
      });
      if (!session) throw new NotFoundException('Game code not found');
      if (session.status === LiveSessionStatus.COMPLETED) {
        throw new BadRequestException('Game is finished');
      }
      if (session.status !== LiveSessionStatus.LOBBY) {
        throw new BadRequestException(
          'Game already started — claim a gone seat instead',
        );
      }

      const seats = parseLobby(session.lobby);
      const present = seats.filter((p) => !p.gone);
      if (present.length >= limits.max) {
        throw new BadRequestException(`Table full (max ${limits.max})`);
      }

      const taken = seats.some(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (taken) throw new BadRequestException('Name already taken');

      if (linkedUserId) {
        const already = seats.some((p) => p.userId === linkedUserId);
        if (already) {
          throw new BadRequestException('You already joined this table');
        }
      }

      const used = new Set(seats.map((p) => p.seatIndex));
      let seatIndex = 0;
      while (used.has(seatIndex)) seatIndex += 1;

      const next: LobbySeat = {
        id: randomBytes(16).toString('hex'),
        name: trimmed,
        token,
        seatIndex,
        isHost: false,
        gone: false,
        userId: linkedUserId ?? null,
      };
      await tx.liveSession.update({
        where: { id: session.id },
        data: { lobby: toInputJson([...seats, next]) },
      });
      return { ...next, sessionId: session.id };
    });

    await logEvent(this.prisma, {
      sessionId: player.sessionId,
      type: GameEventType.PLAYER_JOINED,
      playerId: player.id,
      payload: {
        name: player.name,
        seatIndex: player.seatIndex,
      },
    });

    const updated = await this.loadSession(player.sessionId);
    const view = await this.toView(updated, player.id);
    this.emitSession(player.sessionId);
    return { ...view, token, playerId: player.id };
  }

  /**
   * Take over a seat marked gone (active game). Issues a new device token.
   */
  async claim(codeRaw: string, playerId: string, userId?: string | null) {
    const code = normalizeCode(codeRaw);
    const raw = await this.prisma.liveSession.findUnique({
      where: { code },
    });
    if (!raw) throw new NotFoundException('Game code not found');
    const session = { ...raw, players: await this.loadSeats(raw) };
    if (session.status === LiveSessionStatus.COMPLETED) {
      throw new BadRequestException('Game is finished');
    }
    if (session.status === LiveSessionStatus.LOBBY) {
      throw new BadRequestException('Game has not started — join with a name');
    }

    const target = session.players.find((p) => p.id === playerId);
    if (!target) throw new NotFoundException('Player not found');
    if (!target.gone) {
      throw new BadRequestException('That seat is still occupied');
    }

    const linkedUserId = await resolveExistingUserId(this.prisma, userId);
    if (linkedUserId) {
      const already = session.players.some(
        (p) => p.userId === linkedUserId && p.id !== playerId && !p.gone,
      );
      if (already) {
        throw new BadRequestException('You already have a seat at this table');
      }
    }

    const token = newToken();
    if (!session.gameId) {
      throw new BadRequestException('Live game missing linked scorekeeper');
    }
    const claimed = await this.prisma.gamePlayer.updateMany({
      where: { gameId: session.gameId, playerId, gone: true },
      data: { gone: false, token },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Seat was already claimed');
    }

    if (linkedUserId && !target.userId) {
      const existing = await this.prisma.player.findUnique({
        where: { userId: linkedUserId },
      });
      if (!existing) {
        await this.prisma.player.update({
          where: { id: playerId },
          data: { userId: linkedUserId },
        });
      }
    }

    await logEvent(this.prisma, {
      sessionId: session.id,
      gameId: session.gameId,
      type: GameEventType.SEAT_CLAIMED,
      playerId,
      payload: {
        name: target.name,
        seatIndex: target.seatIndex,
        isHost: target.isHost,
      },
    });

    const updated = await this.loadSession(session.id);
    const view = await this.toView(updated, playerId);
    this.emitSession(session.id);
    return { ...view, token, playerId };
  }

  async leave(sessionId: string, token: string) {
    const session = await this.loadSession(sessionId);
    const actor = this.authPlayer(session, token);

    if (session.status === LiveSessionStatus.COMPLETED) {
      return { ok: true as const, removed: false };
    }

    // Lobby: remove non-host; host leaving tears down the lobby
    if (session.status === LiveSessionStatus.LOBBY) {
      if (actor.isHost) {
        await logEvent(this.prisma, {
          sessionId,
          type: GameEventType.SESSION_ENDED,
          playerId: actor.id,
          payload: { reason: 'host_left_lobby' },
        });
        await this.prisma.liveSession.delete({ where: { id: sessionId } });
        this.emitSession(sessionId);
        return { ok: true as const, removed: true, ended: true as const };
      }
      await logEvent(this.prisma, {
        sessionId,
        type: GameEventType.PLAYER_LEFT,
        playerId: actor.id,
        payload: {
          name: actor.name,
          seatIndex: actor.seatIndex,
          phase: 'lobby',
        },
      });
      await this.saveLobby(
        sessionId,
        session.players.filter((p) => p.id !== actor.id),
      );
      this.emitSession(sessionId);
      return { ok: true as const, removed: true };
    }

    // Active game: mark gone and rotate token so old device cannot act
    if (actor.gone) {
      return { ok: true as const, removed: false, alreadyGone: true as const };
    }
    if (!session.gameId) {
      throw new BadRequestException('Live game missing linked scorekeeper');
    }
    await this.prisma.gamePlayer.update({
      where: {
        gameId_playerId: { gameId: session.gameId, playerId: actor.id },
      },
      data: { gone: true, token: newToken() },
    });
    await logEvent(this.prisma, {
      sessionId,
      gameId: session.gameId,
      type: GameEventType.PLAYER_LEFT,
      playerId: actor.id,
      payload: {
        name: actor.name,
        seatIndex: actor.seatIndex,
        phase: 'playing',
        gone: true,
      },
    });
    this.emitSession(sessionId);
    return { ok: true as const, removed: false, gone: true as const };
  }

  async identifyLiveSocket(sessionId: string, token: string) {
    if (!token) return null;
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status === LiveSessionStatus.COMPLETED) {
      return null;
    }
    const players = await this.loadSeats(session);
    const player = players.find((p) => p.token === token && !p.gone);
    if (!player) return null;
    return { playerId: player.id };
  }

  async dropIfUnsubscribed(sessionId: string, playerId: string) {
    try {
      const session = await this.loadSession(sessionId);
      const actor = session.players.find((p) => p.id === playerId);
      if (!actor || actor.gone) return;
      await this.leave(sessionId, actor.token);
    } catch (e) {
      if (e instanceof NotFoundException) return;
      throw e;
    }
  }

  async getView(sessionId: string, token: string) {
    const session = await this.loadSession(sessionId);
    const player = this.authPlayer(session, token);
    return await this.toView(session, player.id);
  }

  async lookupCode(codeRaw: string) {
    const code = normalizeCode(codeRaw);
    const raw = await this.prisma.liveSession.findUnique({
      where: { code },
    });
    if (!raw) throw new NotFoundException('Game code not found');
    const session = { ...raw, players: await this.loadSeats(raw) };
    if (!session) throw new NotFoundException('Game code not found');
    if (session.status === LiveSessionStatus.COMPLETED) {
      throw new BadRequestException('Game is finished');
    }

    const gonePlayers = session.players
      .filter((p) => p.gone)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isHost: p.isHost,
      }));

    if (session.status === LiveSessionStatus.PLAYING) {
      if (gonePlayers.length === 0) {
        throw new BadRequestException(
          'Game already started — no open seats',
        );
      }
      return {
        id: session.id,
        code: session.code,
        status: session.status as 'PLAYING',
        playerCount: session.players.length,
        presentCount: session.players.filter((p) => !p.gone).length,
        maxPlayers: this.rules.getPlayerLimits().max,
        gonePlayers,
      };
    }

    const present = session.players.filter((p) => !p.gone);
    return {
      id: session.id,
      code: session.code,
      status: 'LOBBY' as const,
      playerCount: present.length,
      presentCount: present.length,
      maxPlayers: this.rules.getPlayerLimits().max,
      gonePlayers: [] as typeof gonePlayers,
    };
  }

  async start(sessionId: string, token: string) {
    const session = await this.loadSession(sessionId);
    const actor = this.authPresentPlayer(session, token);
    if (!actor.isHost) throw new ForbiddenException('Only host can start');
    if (session.status !== LiveSessionStatus.LOBBY) {
      throw new BadRequestException('Game already started');
    }

    const activePlayers = session.players.filter((p) => !p.gone);
    const limits = this.rules.getPlayerLimits();
    if (activePlayers.length < limits.min) {
      throw new BadRequestException(
        `Need at least ${limits.min} players to start`,
      );
    }

    const host = activePlayers.find((p) => p.isHost);
    if (!host) throw new BadRequestException('Host missing');
    const others = activePlayers
      .filter((p) => !p.isHost)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const ordered = [...others, host];

    // CAS: only one start wins
    const claimed = await this.prisma.liveSession.updateMany({
      where: { id: sessionId, status: LiveSessionStatus.LOBBY },
      data: { status: LiveSessionStatus.PLAYING, startedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Game already started');
    }

    const rollbackLobby = async () => {
      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: { status: LiveSessionStatus.LOBBY, startedAt: null },
      });
    };

    // Reject if someone joined between snapshot and CAS
    const afterCas = await this.loadSession(sessionId);
    const presentAfter = afterCas.players.filter((p) => !p.gone);
    if (
      presentAfter.length !== ordered.length ||
      !ordered.every((p) => presentAfter.some((x) => x.id === p.id))
    ) {
      await rollbackLobby();
      throw new BadRequestException(
        'Roster changed while starting — try again',
      );
    }

    const names = ordered.map((p) => p.name);
    const playerUserIds = ordered.map((p) => p.userId ?? null);
    const playerIds: string[] = [];
    try {
      for (const seat of ordered) {
        let player = seat.userId
          ? await this.prisma.player.findUnique({
              where: { userId: seat.userId },
            })
          : null;
        if (!player) {
          player = await this.prisma.player.create({
            data: {
              name: seat.name,
              ...(seat.userId ? { userId: seat.userId } : {}),
            },
          });
        }
        playerIds.push(player.id);
      }
    } catch (e) {
      await rollbackLobby();
      throw e;
    }
    let gameDetail;
    try {
      gameDetail = await this.games.createGame(
        {
          name: `Live ${session.code}`,
          playerNames: names,
          playerIds,
          playerUserIds,
          playMode: 'ONLINE',
        },
        { fromLive: true },
      );
    } catch (e) {
      await rollbackLobby();
      throw e;
    }

    const playerCount = ordered.length;
    const roundNumber = 1;
    const handSize = this.rules.getHandSize(roundNumber);
    const dealerSeat = this.rules.dealerSeat(roundNumber, playerCount);
    const bidOrder = this.rules.bidOrderSeats(roundNumber, playerCount);
    const engine = dealRound({
      playerCount,
      roundNumber,
      handSize,
      dealerSeat,
      bidOrder,
    });

    const seatPlayers = ordered.map((p, seatIndex) => ({
      id: playerIds[seatIndex]!,
      name: p.name,
      seatIndex,
    }));
    const hostPlayerId = playerIds[playerIds.length - 1]!;
    const actorPlayerId =
      playerIds[ordered.findIndex((p) => p.id === actor.id)] ?? hostPlayerId;

    try {
      for (let i = 0; i < playerIds.length; i++) {
        await this.prisma.gamePlayer.update({
          where: {
            gameId_playerId: {
              gameId: gameDetail.id,
              playerId: playerIds[i]!,
            },
          },
          data: {
            token: ordered[i]!.token,
            isHost: ordered[i]!.isHost,
            gone: false,
          },
        });
      }
      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          gameId: gameDetail.id,
          hostPlayerId,
          lobby: toInputJson([]),
        },
      });

      await logEvent(this.prisma, {
        sessionId,
        gameId: gameDetail.id,
        type: GameEventType.GAME_STARTED_LIVE,
        playerId: actorPlayerId,
        payload: {
          code: session.code,
          playerCount,
          seats: seatPlayers,
        },
      });

      await persistDeal(this.prisma, {
        gameId: gameDetail.id,
        sessionId,
        roundNumber,
        state: engine,
        players: seatPlayers,
      });
    } catch (e) {
      await rollbackLobby();
      throw e;
    }

    const updated = await this.loadSession(sessionId);
    const view = await this.toView(updated, actorPlayerId);
    this.emitSession(sessionId);
    return view;
  }

  async bid(sessionId: string, token: string, bid: number, forceBurn?: boolean) {
    return this.serializeSession(sessionId, async () => {
      const session = await this.loadSession(sessionId);
      const actor = this.authPresentPlayer(session, token);
      this.assertPlaying(session);
      if (!session.gameId) {
        throw new BadRequestException('Live game missing linked scorekeeper');
      }

      let state = await this.loadEngine(session);
      const seat = actor.seatIndex;
      const priorSum = state.bids.reduce<number>((s, b) => s + (b ?? 0), 0);
      const isLast = state.bidIndex === state.bidOrder.length - 1;
      const forbidden = isLast
        ? this.rules.forbiddenLastBid(priorSum, state.handSize)
        : null;
      const bidPosition = state.bidIndex;
      const runningBidBefore = priorSum;

      try {
        state = placeBid(state, seat, bid, forceBurn === true, forbidden);
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Invalid bid',
        );
      }

      const players = [...session.players].sort(
        (a, b) => a.seatIndex - b.seatIndex,
      );
      const seatPlayers = players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      }));

      await persistBidPlaced(this.prisma, {
        gameId: session.gameId,
        sessionId,
        roundNumber: state.roundNumber,
        playerId: actor.id,
        seatIndex: seat,
        bid,
        bidPosition,
        runningBidBefore,
        isLast,
        isDealer: seat === state.dealerSeat,
        isFirstBidder: bidPosition === 0,
        forceBurn: forceBurn === true && forbidden !== null,
        forbiddenLastBid: forbidden,
      });

      if (state.phase === 'playing') {
        if (
          !state.bids.every((b) => typeof b === 'number' && Number.isInteger(b))
        ) {
          throw new BadRequestException('Corrupt bids state');
        }
        await this.games.setBids(
          session.gameId,
          state.roundNumber,
          {
            bids: players.map((p) => ({
              playerId: p.id,
              bid: state.bids[p.seatIndex] as number,
            })),
            forceBurn: state.forceBurn,
          },
          { fromLive: true },
        );
        await persistCurrentTrick(this.prisma, {
          gameId: session.gameId,
          roundNumber: state.roundNumber,
          state,
          players: seatPlayers,
        });
      }

      const updated = await this.loadSession(sessionId);
      const view = await this.toView(updated, actor.id);
      this.emitSession(sessionId);
      return view;
    });
  }

  async play(sessionId: string, token: string, cardStr: string) {
    const card = parseCard(cardStr);
    return this.serializeSession(sessionId, async () => {
      const session = await this.loadSession(sessionId);
      const actor = this.authPresentPlayer(session, token);
      this.assertPlaying(session);
      if (!session.gameId) {
        throw new BadRequestException('Live game missing linked scorekeeper');
      }

      let state = await this.loadEngine(session);
      const players = [...session.players].sort(
        (a, b) => a.seatIndex - b.seatIndex,
      );
      const seatPlayers = players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      }));

      const trickIndexBefore = state.tricksPlayed;
      const playOrderBefore = state.currentTrick?.plays.length ?? 0;
      const leadSuitBefore =
        state.currentTrick && state.currentTrick.plays.length > 0
          ? state.currentTrick.plays[0]!.card.s
          : null;
      const leadSeatBefore =
        state.currentTrick?.leadSeat ?? state.turnSeat ?? actor.seatIndex;
      const roundNumberAtPlay = state.roundNumber;

      try {
        state = playCard(state, actor.seatIndex, card);
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Invalid play',
        );
      }

      const trickSnap =
        state.lastTrick &&
        state.tricksPlayed === trickIndexBefore + 1 &&
        state.trumpSuit
          ? {
              plays: state.lastTrick.plays,
              winnerSeat: state.lastTrick.winnerSeat,
              leadSuit: state.lastTrick.leadSuit,
              trumpSuit: state.trumpSuit,
            }
          : null;

      if (state.trumpSuit) {
        await persistCardPlay(this.prisma, {
          gameId: session.gameId,
          sessionId,
          roundNumber: roundNumberAtPlay,
          trickIndex: trickIndexBefore,
          playOrder: playOrderBefore,
          seatIndex: actor.seatIndex,
          playerId: actor.id,
          card,
          leadSuit: leadSuitBefore,
          trumpSuit: state.trumpSuit,
        });
      }

      if (trickSnap) {
        await persistCompletedTrick(this.prisma, {
          gameId: session.gameId,
          sessionId,
          roundNumber: roundNumberAtPlay,
          trickIndex: trickIndexBefore,
          leadSeat: leadSeatBefore,
          leadSuit: trickSnap.leadSuit,
          winnerSeat: trickSnap.winnerSeat,
          trumpSuit: trickSnap.trumpSuit,
          plays: trickSnap.plays,
          players: seatPlayers,
        });
      }

      if (
        state.phase === 'trick_reveal' &&
        state.tricksPlayed >= state.handSize
      ) {
        state = await this.finalizeRound(session, state, seatPlayers);
      } else {
        await persistCurrentTrick(this.prisma, {
          gameId: session.gameId,
          roundNumber: roundNumberAtPlay,
          state,
          players: seatPlayers,
        });
      }

      if (state.phase === 'complete') {
        await this.prisma.liveSession.update({
          where: { id: sessionId },
          data: {
            status: LiveSessionStatus.COMPLETED,
            finishedAt: new Date(),
          },
        });
        await logEvent(this.prisma, {
          sessionId,
          gameId: session.gameId,
          type: GameEventType.GAME_COMPLETED,
          payload: { roundNumber: state.roundNumber },
        });
      }

      const updated = await this.loadSession(sessionId);
      const view = await this.toView(updated, actor.id);
      this.emitSession(sessionId);
      return view;
    });
  }

  /** In-process mutex per session (single API instance / docker replica). */
  private readonly sessionChains = new Map<string, Promise<unknown>>();

  private serializeSession<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sessionChains.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.sessionChains.set(
      sessionId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async finalizeRound(
    session: SessionWithPlayers,
    state: EngineState,
    seatPlayers: { id: string; name: string; seatIndex: number }[],
  ): Promise<EngineState> {
    if (!session.gameId) {
      throw new BadRequestException('Missing linked game');
    }
    const players = [...session.players].sort(
      (a, b) => a.seatIndex - b.seatIndex,
    );
    for (let s = 0; s < state.playerCount; s++) {
      if (state.tricksTaken[s] == null || !Number.isInteger(state.tricksTaken[s])) {
        throw new BadRequestException('Corrupt tricksTaken state');
      }
    }
    await this.games.setTricks(
      session.gameId,
      state.roundNumber,
      {
        tricks: players.map((p) => ({
          playerId: p.id,
          tricksTaken: state.tricksTaken[p.seatIndex] as number,
        })),
      },
      { fromLive: true },
    );

    await logEvent(this.prisma, {
      sessionId: session.id,
      gameId: session.gameId,
      type: GameEventType.ROUND_SCORED,
      roundNumber: state.roundNumber,
      payload: {
        tricksTaken: players.map((p) => ({
          playerId: p.id,
          seatIndex: p.seatIndex,
          tricks: state.tricksTaken[p.seatIndex] ?? 0,
          bid: state.bids[p.seatIndex],
        })),
      },
    });

    const totalRounds = this.rules.getTotalRounds();
    if (state.roundNumber >= totalRounds) {
      return {
        ...state,
        phase: 'complete',
        currentTrick: null,
        turnSeat: null,
      };
    }

    const nextRound = state.roundNumber + 1;
    const playerCount = state.playerCount;
    const handSize = this.rules.getHandSize(nextRound);
    const dealerSeat = this.rules.dealerSeat(nextRound, playerCount);
    const bidOrder = this.rules.bidOrderSeats(nextRound, playerCount);
    const next = dealRound({
      playerCount,
      roundNumber: nextRound,
      handSize,
      dealerSeat,
      bidOrder,
    });

    await persistDeal(this.prisma, {
      gameId: session.gameId,
      sessionId: session.id,
      roundNumber: nextRound,
      state: next,
      players: seatPlayers,
    });

    return next;
  }

  private emitSession(sessionId: string) {
    this.realtime.emitLive(sessionId, { at: Date.now(), sessionId });
  }

  private async loadSeats(
    session: Prisma.LiveSessionGetPayload<Record<string, never>>,
  ): Promise<LobbySeat[]> {
    if (session.status === LiveSessionStatus.LOBBY || !session.gameId) {
      return parseLobby(session.lobby);
    }
    const seats = await this.prisma.gamePlayer.findMany({
      where: { gameId: session.gameId },
      orderBy: { seatIndex: 'asc' },
      include: { player: true },
    });
    return seats.map((s) => {
      if (!s.token) {
        throw new BadRequestException('Live seat missing token');
      }
      return {
        id: s.player.id,
        name: s.player.name,
        token: s.token,
        seatIndex: s.seatIndex,
        isHost: s.isHost,
        gone: s.gone,
        userId: s.player.userId,
      };
    });
  }

  private async saveLobby(sessionId: string, seats: LobbySeat[]) {
    await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { lobby: toInputJson(seats) },
    });
  }

  private async loadSession(id: string): Promise<SessionWithPlayers> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
    });
    if (!session) throw new NotFoundException('Session not found');
    const players = await this.loadSeats(session);
    return { ...session, players };
  }

  private authPlayer(session: SessionWithPlayers, token: string) {
    const player = session.players.find((p) => p.token === token);
    if (!player) throw new ForbiddenException('Invalid player token');
    return player;
  }

  /** Auth that also rejects seats marked gone. */
  private authPresentPlayer(session: SessionWithPlayers, token: string) {
    const player = this.authPlayer(session, token);
    if (player.gone) {
      throw new ForbiddenException('You left this game — reclaim your seat');
    }
    return player;
  }

  private assertPlaying(session: SessionWithPlayers) {
    if (session.status !== LiveSessionStatus.PLAYING) {
      throw new BadRequestException('Game is not in progress');
    }
  }

  private async allocCode(): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = randomDigitCode();
      const existing = await this.prisma.liveSession.findUnique({
        where: { code },
      });
      if (!existing) return code;
      // Finished tables keep a unique code forever — free the 4-digit one.
      if (existing.status === LiveSessionStatus.COMPLETED) {
        await this.prisma.liveSession.update({
          where: { id: existing.id },
          data: {
            code: `${code}-${existing.id.replace(/-/g, '').slice(0, 8)}`,
          },
        });
        return code;
      }
    }
    throw new BadRequestException('Could not allocate game code');
  }

  private async loadLiveGame(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        seats: gameSeatInclude,
        rounds: {
          orderBy: { number: 'asc' },
          include: {
            entries: { include: { player: true } },
            tricks: {
              orderBy: { trickIndex: 'asc' },
              include: {
                plays: { orderBy: { playOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!game) throw new NotFoundException('Linked game not found');
    return game;
  }

  private async loadEngine(session: SessionWithPlayers): Promise<EngineState> {
    if (session.status === LiveSessionStatus.LOBBY) {
      return emptyLobbyState();
    }
    if (!session.gameId) {
      throw new BadRequestException('Live game missing linked scorekeeper');
    }
    let game = await this.loadLiveGame(session.gameId);
    if (session.status === LiveSessionStatus.PLAYING) {
      const open = game.rounds.find((r) => r.completedAt == null);
      if (open && !roundHasDeal(open)) {
        const players = [...session.players].sort(
          (a, b) => a.seatIndex - b.seatIndex,
        );
        const playerCount = players.length;
        const engine = dealRound({
          playerCount,
          roundNumber: open.number,
          handSize: this.rules.getHandSize(open.number),
          dealerSeat: this.rules.dealerSeat(open.number, playerCount),
          bidOrder: this.rules.bidOrderSeats(open.number, playerCount),
        });
        await persistDeal(this.prisma, {
          gameId: game.id,
          sessionId: session.id,
          roundNumber: open.number,
          state: engine,
          players: players.map((p) => ({
            id: p.id,
            name: p.name,
            seatIndex: p.seatIndex,
          })),
        });
        game = await this.loadLiveGame(session.gameId);
      }
    }
    return engineFromScorecard({
      sessionStatus: session.status,
      players: seatedPlayers(game.seats).map((p) => ({
        id: p.id,
        seatIndex: p.seatIndex,
      })),
      rounds: game.rounds,
    });
  }

  private async toView(session: SessionWithPlayers, viewerId: string) {
    const state = await this.loadEngine(session);
    const players = [...session.players].sort(
      (a, b) => a.seatIndex - b.seatIndex,
    );
    const me = players.find((p) => p.id === viewerId);
    if (!me) throw new ForbiddenException('Not a player in this session');

    const publicBids = players.map((p) => ({
      playerId: p.id,
      seatIndex: p.seatIndex,
      name: p.name,
      bid: state.phase === 'lobby' ? null : (state.bids[p.seatIndex] ?? null),
      tricksTaken:
        state.phase === 'lobby' || state.phase === 'bidding'
          ? null
          : (state.tricksTaken[p.seatIndex] ?? 0),
    }));

    const bidderSeat = currentBidderSeat(state);
    const table = tablePlays(state);

    const hand =
      state.phase === 'lobby' || state.phase === 'complete'
        ? []
        : (state.hands[me.seatIndex] ?? []);

    const leadSuit =
      state.currentTrick && state.currentTrick.plays.length > 0
        ? state.currentTrick.plays[0]!.card.s
        : null;

    let legalCardKeys: string[] = [];
    if (
      state.phase === 'playing' &&
      state.turnSeat === me.seatIndex &&
      hand.length
    ) {
      legalCardKeys = legalPlays(hand, leadSuit).map(cardKey);
    }

    const priorBidSum = state.bids.reduce<number>(
      (s, b) => s + (b ?? 0),
      0,
    );
    const isMyBidTurn =
      state.phase === 'bidding' && bidderSeat === me.seatIndex;
    const isLastBidder =
      isMyBidTurn && state.bidIndex === state.bidOrder.length - 1;
    const forbiddenLastBid =
      isLastBidder
        ? this.rules.forbiddenLastBid(priorBidSum, state.handSize)
        : null;

    return {
      id: session.id,
      code: session.code,
      status: session.status,
      hostPlayerId: session.hostPlayerId,
      gameId: session.gameId,
      me: {
        playerId: me.id,
        name: me.name,
        seatIndex: me.seatIndex,
        isHost: me.isHost,
        gone: me.gone,
      },
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isHost: p.isHost,
        gone: p.gone,
      })),
      phase: state.phase,
      roundNumber: state.roundNumber || null,
      handSize: state.handSize || null,
      dealerSeat: state.phase === 'lobby' ? null : state.dealerSeat,
      trumpSuit: state.trumpSuit,
      trumpCard: state.trumpCard,
      forceBurn: state.forceBurn,
      bids: publicBids,
      turnSeat: state.turnSeat,
      bidderSeat,
      isMyTurn:
        !me.gone &&
        ((state.phase === 'bidding' && bidderSeat === me.seatIndex) ||
          (state.phase === 'playing' && state.turnSeat === me.seatIndex)),
      isMyBidTurn: isMyBidTurn && !me.gone,
      forbiddenLastBid,
      priorBidSum: state.phase === 'bidding' ? priorBidSum : null,
      hand: me.gone
        ? []
        : hand.map((c) => ({
            key: cardKey(c),
            suit: c.s,
            rank: c.r,
          })),
      legalCardKeys: me.gone ? [] : legalCardKeys,
      table: {
        plays: table.plays.map((p) => ({
          seat: p.seat,
          playerId: players.find((x) => x.seatIndex === p.seat)?.id ?? null,
          card: {
            key: cardKey(p.card),
            suit: p.card.s,
            rank: p.card.r,
          },
        })),
        leadSuit: table.leadSuit,
        winnerSeat: table.winnerSeat,
        complete: table.complete,
      },
      tricksPlayed: state.tricksPlayed,
      maxPlayers: this.rules.getPlayerLimits().max,
      minPlayers: this.rules.getPlayerLimits().min,
      canStart:
        session.status === LiveSessionStatus.LOBBY &&
        me.isHost &&
        !me.gone &&
        players.filter((p) => !p.gone).length >=
          this.rules.getPlayerLimits().min,
      goneCount: players.filter((p) => p.gone).length,
    };
  }

}

function newToken(): string {
  return randomBytes(24).toString('hex');
}

function randomDigitCode(): string {
  const n = CODE_MIN + (randomBytes(2).readUInt16BE(0) % CODE_SPAN);
  return n.toString().padStart(CODE_DIGITS, '0');
}

function normalizeCode(raw: string): string {
  return raw.trim().replace(/\D/g, '');
}

const RANK_SET = new Set([
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
]);
const SUIT_SET = new Set(['C', 'D', 'H', 'S']);

function parseCard(str: string): Card {
  if (typeof str !== 'string' || str.length !== 2) {
    throw new BadRequestException('Invalid card');
  }
  const rank = str[0]!;
  const suit = str[1]!;
  if (!RANK_SET.has(rank) || !SUIT_SET.has(suit)) {
    throw new BadRequestException('Invalid card');
  }
  return { r: rank as Card['r'], s: suit as Suit };
}
