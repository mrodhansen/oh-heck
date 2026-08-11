import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LiveSessionStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GamesService } from '../games/games.service';
import {
  currentBidderSeat,
  dealRound,
  emptyLobbyState,
  EngineState,
  placeBid,
  playCard,
  tablePlays,
} from './engine';
import { Card, cardKey, legalPlays, Suit } from './cards';
import {
  logLiveEvent,
  persistBidPlaced,
  persistCardPlay,
  persistCompletedTrick,
  persistDeal,
} from './telemetry';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type SessionWithPlayers = Prisma.LiveSessionGetPayload<{
  include: { players: true };
}>;

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly realtime: RealtimeGateway,
    private readonly games: GamesService,
  ) {}

  async create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name required');

    const token = newToken();
    const code = await this.allocCode();

    const session = await this.prisma.liveSession.create({
      data: {
        code,
        status: LiveSessionStatus.LOBBY,
        state: emptyLobbyState() as unknown as Prisma.InputJsonValue,
        players: {
          create: {
            name: trimmed,
            seatIndex: 0,
            token,
            isHost: true,
          },
        },
      },
      include: { players: { orderBy: { createdAt: 'asc' } } },
    });

    const host = session.players[0]!;
    await this.prisma.liveSession.update({
      where: { id: session.id },
      data: { hostPlayerId: host.id },
    });
    session.hostPlayerId = host.id;

    await logLiveEvent(this.prisma, {
      sessionId: session.id,
      type: 'SESSION_CREATED',
      playerId: host.id,
      payload: { code: session.code, hostName: host.name },
    });

    const view = this.toView(session, host.id);
    this.emitSession(session.id);
    return { ...view, token, playerId: host.id };
  }

  async join(codeRaw: string, name: string) {
    const code = normalizeCode(codeRaw);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name required');

    const token = newToken();
    const limits = this.rules.getPlayerLimits();

    const player = await this.prisma.$transaction(async (tx) => {
      const session = await tx.liveSession.findUnique({
        where: { code },
        include: { players: { orderBy: { seatIndex: 'asc' } } },
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

      const present = session.players.filter((p) => !p.gone);
      if (present.length >= limits.max) {
        throw new BadRequestException(`Table full (max ${limits.max})`);
      }

      const taken = session.players.some(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (taken) throw new BadRequestException('Name already taken');

      // Lowest free seat (leave deletes rows without compacting)
      const used = new Set(session.players.map((p) => p.seatIndex));
      let seatIndex = 0;
      while (used.has(seatIndex)) seatIndex += 1;

      return tx.livePlayer.create({
        data: {
          sessionId: session.id,
          name: trimmed,
          seatIndex,
          token,
          isHost: false,
          gone: false,
        },
      });
    });

    await logLiveEvent(this.prisma, {
      sessionId: player.sessionId,
      type: 'PLAYER_JOINED',
      playerId: player.id,
      payload: {
        name: player.name,
        seatIndex: player.seatIndex,
      },
    });

    const updated = await this.loadSession(player.sessionId);
    const view = this.toView(updated, player.id);
    this.emitSession(player.sessionId);
    return { ...view, token, playerId: player.id };
  }

  /**
   * Take over a seat marked gone (active game). Issues a new device token.
   */
  async claim(codeRaw: string, playerId: string) {
    const code = normalizeCode(codeRaw);
    const session = await this.prisma.liveSession.findUnique({
      where: { code },
      include: { players: true },
    });
    if (!session) throw new NotFoundException('Game code not found');
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

    const token = newToken();
    const claimed = await this.prisma.livePlayer.updateMany({
      where: { id: playerId, sessionId: session.id, gone: true },
      data: { gone: false, token },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Seat was already claimed');
    }

    await logLiveEvent(this.prisma, {
      sessionId: session.id,
      gameId: session.gameId,
      type: 'SEAT_CLAIMED',
      playerId,
      payload: {
        name: target.name,
        seatIndex: target.seatIndex,
        isHost: target.isHost,
      },
    });
    if (session.gameId) {
      await this.prisma.gameEvent.create({
        data: {
          gameId: session.gameId,
          type: 'SEAT_CLAIMED',
          payload: {
            playerId,
            name: target.name,
            seatIndex: target.seatIndex,
          },
        },
      });
    }

    const updated = await this.loadSession(session.id);
    const view = this.toView(updated, playerId);
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
        await logLiveEvent(this.prisma, {
          sessionId,
          type: 'SESSION_ENDED',
          playerId: actor.id,
          payload: { reason: 'host_left_lobby' },
        });
        await this.prisma.liveSession.delete({ where: { id: sessionId } });
        this.emitSession(sessionId);
        return { ok: true as const, removed: true, ended: true as const };
      }
      await logLiveEvent(this.prisma, {
        sessionId,
        type: 'PLAYER_LEFT',
        playerId: actor.id,
        payload: {
          name: actor.name,
          seatIndex: actor.seatIndex,
          phase: 'lobby',
        },
      });
      await this.prisma.livePlayer.delete({ where: { id: actor.id } });
      this.emitSession(sessionId);
      return { ok: true as const, removed: true };
    }

    // Active game: mark gone and rotate token so old device cannot act
    if (actor.gone) {
      return { ok: true as const, removed: false, alreadyGone: true as const };
    }
    await this.prisma.livePlayer.update({
      where: { id: actor.id },
      data: { gone: true, token: newToken() },
    });
    await logLiveEvent(this.prisma, {
      sessionId,
      gameId: session.gameId,
      type: 'PLAYER_LEFT',
      playerId: actor.id,
      payload: {
        name: actor.name,
        seatIndex: actor.seatIndex,
        phase: 'playing',
        gone: true,
      },
    });
    if (session.gameId) {
      await this.prisma.gameEvent.create({
        data: {
          gameId: session.gameId,
          type: 'PLAYER_LEFT',
          payload: {
            playerId: actor.id,
            name: actor.name,
            seatIndex: actor.seatIndex,
          },
        },
      });
    }
    this.emitSession(sessionId);
    return { ok: true as const, removed: false, gone: true as const };
  }

  async getView(sessionId: string, token: string) {
    const session = await this.loadSession(sessionId);
    const player = this.authPlayer(session, token);
    return this.toView(session, player.id);
  }

  async lookupCode(codeRaw: string) {
    const code = normalizeCode(codeRaw);
    const session = await this.prisma.liveSession.findUnique({
      where: { code },
      include: { players: { orderBy: { seatIndex: 'asc' } } },
    });
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

    // Drop anyone still marked gone from lobby before seating
    const goneIds = session.players.filter((p) => p.gone).map((p) => p.id);
    if (goneIds.length) {
      await this.prisma.livePlayer.deleteMany({
        where: { id: { in: goneIds }, sessionId },
      });
    }

    // Seat order: joiners by join time, host last (round-1 dealer)
    const host = activePlayers.find((p) => p.isHost);
    if (!host) throw new BadRequestException('Host missing');
    const others = activePlayers
      .filter((p) => !p.isHost)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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

    try {
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < ordered.length; i++) {
          await tx.livePlayer.update({
            where: { id: ordered[i]!.id },
            data: { seatIndex: 1000 + i },
          });
        }
        for (let i = 0; i < ordered.length; i++) {
          await tx.livePlayer.update({
            where: { id: ordered[i]!.id },
            data: { seatIndex: i },
          });
        }
      });
    } catch (e) {
      await rollbackLobby();
      throw e;
    }

    const names = ordered.map((p) => p.name);
    const playerIds = ordered.map((p) => p.id);
    let gameDetail;
    try {
      gameDetail = await this.games.createGame(
        {
          name: `Live ${session.code}`,
          playerNames: names,
          playerIds,
          playMode: 'ONLINE',
          liveCode: session.code,
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
      id: p.id,
      name: p.name,
      seatIndex,
    }));

    try {
      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          gameId: gameDetail.id,
          state: engine as unknown as Prisma.InputJsonValue,
        },
      });

      await logLiveEvent(this.prisma, {
        sessionId,
        gameId: gameDetail.id,
        type: 'GAME_STARTED_LIVE',
        playerId: actor.id,
        payload: {
          code: session.code,
          playerCount,
          seats: seatPlayers,
        },
      });
      await this.prisma.gameEvent.create({
        data: {
          gameId: gameDetail.id,
          type: 'GAME_STARTED_LIVE',
          payload: {
            sessionId,
            code: session.code,
            seats: seatPlayers,
          },
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
    const view = this.toView(updated, actor.id);
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

      let state = readState(session.state, session.status);
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

      // Scorekeeper + telemetry before committing engine state (avoid stuck bidding)
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
        forceBurn: forceBurn === true && forbidden !== null,
        forbiddenLastBid: forbidden,
      });

      if (state.phase === 'playing') {
        if (
          !state.bids.every((b) => typeof b === 'number' && Number.isInteger(b))
        ) {
          throw new BadRequestException('Corrupt bids state');
        }
        const players = [...session.players].sort(
          (a, b) => a.seatIndex - b.seatIndex,
        );
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
      }

      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: { state: state as unknown as Prisma.InputJsonValue },
      });

      const updated = await this.loadSession(sessionId);
      const view = this.toView(updated, actor.id);
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

      let state = readState(session.state, session.status);
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
      }

      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          state: state as unknown as Prisma.InputJsonValue,
          ...(state.phase === 'complete'
            ? {
                status: LiveSessionStatus.COMPLETED,
                finishedAt: new Date(),
              }
            : {}),
        },
      });

      if (state.phase === 'complete') {
        await logLiveEvent(this.prisma, {
          sessionId,
          gameId: session.gameId,
          type: 'GAME_COMPLETED',
          payload: { roundNumber: state.roundNumber },
        });
      }

      const updated = await this.loadSession(sessionId);
      const view = this.toView(updated, actor.id);
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

    await logLiveEvent(this.prisma, {
      sessionId: session.id,
      gameId: session.gameId,
      type: 'ROUND_SCORED',
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

  private async loadSession(id: string): Promise<SessionWithPlayers> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: { players: { orderBy: { seatIndex: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
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
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode(6);
      const existing = await this.prisma.liveSession.findUnique({
        where: { code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not allocate game code');
  }

  private toView(session: SessionWithPlayers, viewerId: string) {
    const state = readState(session.state, session.status);
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

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function readState(
  raw: Prisma.JsonValue,
  status?: LiveSessionStatus,
): EngineState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    if (status && status !== LiveSessionStatus.LOBBY) {
      throw new BadRequestException('Corrupt live game state');
    }
    return emptyLobbyState();
  }
  const s = raw as unknown as EngineState;
  if (!s.phase) {
    if (status && status !== LiveSessionStatus.LOBBY) {
      throw new BadRequestException('Corrupt live game state');
    }
    return emptyLobbyState();
  }
  if (
    status === LiveSessionStatus.PLAYING &&
    (s.phase === 'lobby' || !Array.isArray(s.hands))
  ) {
    throw new BadRequestException('Corrupt live game state');
  }
  return s;
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
