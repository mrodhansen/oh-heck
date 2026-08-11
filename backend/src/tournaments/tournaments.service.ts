import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GameStatus,
  Prisma,
  TournamentStage,
  TournamentStatus,
  TournamentTableStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GamesService } from '../games/games.service';
import {
  AddTournamentPlayerDto,
  CreateTournamentDto,
  SetTableDealerDto,
} from './dto';
import {
  balanceTableSizes,
  rotateDealerLast,
  shuffleInPlace,
} from './table-balance';

const tableInclude = {
  seats: {
    orderBy: { seatIndex: 'asc' as const },
    include: { tournamentPlayer: true },
  },
  game: {
    include: {
      players: { orderBy: { seatIndex: 'asc' as const } },
      rounds: { include: { entries: true } },
    },
  },
} satisfies Prisma.TournamentTableInclude;

const tournamentInclude = {
  players: { orderBy: { orderIndex: 'asc' as const } },
  tables: {
    orderBy: [{ stage: 'asc' as const }, { tableNumber: 'asc' as const }],
    include: tableInclude,
  },
} satisfies Prisma.TournamentInclude;

type FullTournament = Prisma.TournamentGetPayload<{
  include: typeof tournamentInclude;
}>;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => GamesService))
    private readonly games: GamesService,
  ) {}

  async listOpen() {
    const rows = await this.prisma.tournament.findMany({
      where: {
        status: {
          in: [
            TournamentStatus.OPEN,
            TournamentStatus.SEATED,
            TournamentStatus.IN_PROGRESS,
            TournamentStatus.HIGH_TABLE,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        players: true,
        tables: { include: { game: true } },
      },
    });
    return rows.map((t) => this.toSummary(t));
  }

  async listAll() {
    const rows = await this.prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        players: true,
        tables: { include: { game: true } },
      },
    });
    return rows.map((t) => this.toSummary(t));
  }

  async get(id: string) {
    let highTableError: string | null = null;
    const before = await this.prisma.tournament.findUnique({
      where: { id },
      select: { status: true, highTableAt: true, finishedAt: true },
    });
    try {
      await this.tryFinalizePrelims(id);
      await this.tryFinalizeTournament(id);
    } catch (e) {
      highTableError =
        e instanceof BadRequestException
          ? e.message
          : 'Tournament finalization failed';
      if (!(e instanceof BadRequestException)) {
        // Log non-domain failures server-side without leaking internals to clients
        console.error('tryFinalize failed', id, e);
      }
    }
    const t = await this.findFull(id);
    if (
      before &&
      (before.status !== t.status ||
        before.highTableAt?.getTime() !== t.highTableAt?.getTime() ||
        before.finishedAt?.getTime() !== t.finishedAt?.getTime())
    ) {
      this.realtime.emitTournament(id, this.toDetail(t));
      this.realtime.emitTournamentList();
    }
    return { ...this.toDetail(t), highTableError };
  }

  async create(dto: CreateTournamentDto) {
    if (dto.targetPlayerCount < 2) {
      throw new BadRequestException('Need at least 2 players');
    }
    if (dto.targetPlayerCount > 49) {
      throw new BadRequestException('Max 49 players (7×7 tables)');
    }

    if (dto.id) {
      const existing = await this.prisma.tournament.findUnique({
        where: { id: dto.id },
        include: tournamentInclude,
      });
      if (existing) {
        if (existing.targetPlayerCount !== dto.targetPlayerCount) {
          throw new BadRequestException(
            'Tournament id already exists with different target player count',
          );
        }
        const incomingName = dto.name?.trim() || null;
        if (dto.name !== undefined && existing.name !== incomingName) {
          throw new BadRequestException(
            'Tournament id already exists with different name',
          );
        }
        return this.toDetail(existing);
      }
    }

    const created = await this.prisma.tournament.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        name: dto.name?.trim() || null,
        targetPlayerCount: dto.targetPlayerCount,
        status: TournamentStatus.OPEN,
      },
      include: tournamentInclude,
    });

    const detail = this.toDetail(created);
    this.realtime.emitTournamentList();
    this.realtime.emitTournament(created.id, detail);
    return detail;
  }

  async addPlayer(tournamentId: string, dto: AddTournamentPlayerDto) {
    const t = await this.findFull(tournamentId);
    if (t.status !== TournamentStatus.OPEN) {
      throw new BadRequestException('Tournament is no longer accepting names');
    }

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name required');

    if (t.players.length >= 49) {
      throw new BadRequestException('Max 49 players (7×7 tables)');
    }

    const dup = t.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (dup) throw new BadRequestException('Name already added');

    const orderIndex =
      t.players.reduce((m, p) => Math.max(m, p.orderIndex), -1) + 1;

    const nextCount = t.players.length + 1;
    const growTarget = nextCount > t.targetPlayerCount;

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentPlayer.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          tournamentId,
          name,
          orderIndex,
        },
      });
      if (growTarget) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { targetPlayerCount: nextCount },
        });
      }
    });

    return this.refreshAndEmit(tournamentId);
  }

  async removePlayer(tournamentId: string, playerId: string) {
    const t = await this.findFull(tournamentId);
    if (t.status !== TournamentStatus.OPEN) {
      throw new BadRequestException('Cannot remove players after seating');
    }
    const player = t.players.find((p) => p.id === playerId);
    if (!player) throw new NotFoundException('Player not found');

    await this.prisma.tournamentPlayer.delete({ where: { id: playerId } });
    return this.refreshAndEmit(tournamentId);
  }

  async seatTables(tournamentId: string) {
    const t = await this.findFull(tournamentId);
    if (t.status !== TournamentStatus.OPEN) {
      throw new BadRequestException('Tables already seated');
    }
    if (t.players.length < t.targetPlayerCount) {
      throw new BadRequestException(
        `Need at least ${t.targetPlayerCount} players before seating (have ${t.players.length})`,
      );
    }

    let sizes: number[];
    try {
      sizes = balanceTableSizes(
        t.players.length,
        t.preferredTableSize,
        t.minTableSize,
        t.maxTableSize,
      );
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot balance tables for this roster',
      );
    }

    const roster = shuffleInPlace([...t.players]);
    let cursor = 0;
    const tablePlans: { tableNumber: number; playerIds: string[] }[] = [];

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i]!;
      const slice = roster.slice(cursor, cursor + size);
      cursor += size;
      tablePlans.push({
        tableNumber: i + 1,
        playerIds: slice.map((p) => p.id),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tournament.updateMany({
        where: { id: tournamentId, status: TournamentStatus.OPEN },
        data: {
          status: TournamentStatus.SEATED,
          seatedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Tables already seated');
      }

      for (const plan of tablePlans) {
        await tx.tournamentTable.create({
          data: {
            tournamentId,
            tableNumber: plan.tableNumber,
            stage: TournamentStage.PRELIM,
            isHighTable: false,
            status: TournamentTableStatus.READY,
            dealerSeat: plan.playerIds.length - 1,
            seats: {
              create: plan.playerIds.map((tournamentPlayerId, seatIndex) => ({
                tournamentPlayerId,
                seatIndex,
              })),
            },
          },
        });
      }
    });

    return this.refreshAndEmit(tournamentId);
  }

  async setTableDealer(
    tournamentId: string,
    tableId: string,
    dto: SetTableDealerDto,
  ) {
    const t = await this.findFull(tournamentId);
    const table = t.tables.find((tb) => tb.id === tableId);
    if (!table) throw new NotFoundException('Table not found');
    if (table.status !== TournamentTableStatus.READY) {
      throw new BadRequestException('Can only set dealer before game starts');
    }
    if (table.game) {
      throw new BadRequestException('Game already started');
    }

    const seat = table.seats.find(
      (s) => s.tournamentPlayerId === dto.tournamentPlayerId,
    );
    if (!seat) throw new BadRequestException('Player not at this table');

    const ordered = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);
    const dealerIdx = ordered.findIndex(
      (s) => s.tournamentPlayerId === dto.tournamentPlayerId,
    );
    const rotated = rotateDealerLast(ordered, dealerIdx);

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < rotated.length; i++) {
        await tx.tournamentTableSeat.update({
          where: { id: rotated[i]!.id },
          data: { seatIndex: i },
        });
      }
      await tx.tournamentTable.update({
        where: { id: tableId },
        data: { dealerSeat: rotated.length - 1 },
      });
    });

    return this.refreshAndEmit(tournamentId);
  }

  async startTableGame(tournamentId: string, tableId: string) {
    const t = await this.findFull(tournamentId);
    const table = t.tables.find((tb) => tb.id === tableId);
    if (!table) throw new NotFoundException('Table not found');
    if (table.game) {
      throw new BadRequestException('Game already started for this table');
    }
    if (
      table.status !== TournamentTableStatus.READY &&
      table.status !== TournamentTableStatus.PENDING
    ) {
      throw new BadRequestException('Table is not ready to start');
    }

    const seats = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);
    if (seats.length < 2 || seats.length > 7) {
      throw new BadRequestException('Invalid seat count for a game');
    }

    const names = seats.map((s) => s.tournamentPlayer.name);
    const gameName = table.isHighTable
      ? `${t.name ?? 'Tournament'} — High Table`
      : `${t.name ?? 'Tournament'} — Table ${table.tableNumber}`;

    const game = await this.games.createGame({
      playerNames: names,
      name: gameName,
    });

    // Link tournament players onto game players by seat index
    try {
      await this.prisma.$transaction(async (tx) => {
        const fullGame = await tx.game.findUniqueOrThrow({
          where: { id: game.id },
          include: { players: { orderBy: { seatIndex: 'asc' } } },
        });

        if (fullGame.players.length !== seats.length) {
          throw new BadRequestException(
            'Game player count does not match table seats',
          );
        }

        for (const gp of fullGame.players) {
          const seat = seats.find((s) => s.seatIndex === gp.seatIndex);
          if (!seat) {
            throw new BadRequestException(
              `No tournament seat for game seat index ${gp.seatIndex}`,
            );
          }
          await tx.player.update({
            where: { id: gp.id },
            data: { tournamentPlayerId: seat.tournamentPlayerId },
          });
        }

        await tx.game.update({
          where: { id: game.id },
          data: {
            tournamentTableId: table.id,
            tournamentId,
            isHighTable: table.isHighTable,
            tableNumber: table.tableNumber,
          },
        });

        await tx.tournamentTable.update({
          where: { id: table.id },
          data: {
            status: TournamentTableStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        });

        const tourneyStatus = table.isHighTable
          ? TournamentStatus.HIGH_TABLE
          : TournamentStatus.IN_PROGRESS;

        await tx.tournament.update({
          where: { id: tournamentId },
          data: {
            status: tourneyStatus,
            startedAt: t.startedAt ?? new Date(),
            ...(table.isHighTable && !t.highTableAt
              ? { highTableAt: new Date() }
              : {}),
          },
        });
      });
    } catch (e) {
      // Avoid orphan non-tournament game if link fails
      await this.prisma.game
        .delete({ where: { id: game.id } })
        .catch(() => undefined);
      throw e;
    }

    const detail = await this.refreshAndEmit(tournamentId);
    const gameDetail = await this.games.getGame(game.id);
    this.realtime.emitGame(game.id, gameDetail);
    return { tournament: detail, game: gameDetail };
  }

  /**
   * Called after a game reaches COMPLETED. Marks table done and may form high table.
   */
  async onGameCompleted(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        tournamentTable: true,
        players: { orderBy: { seatIndex: 'asc' } },
        rounds: { include: { entries: true } },
      },
    });
    if (!game?.tournamentTableId || !game.tournamentId) return null;

    const tableId = game.tournamentTableId;
    const tournamentId = game.tournamentId;

    await this.prisma.tournamentTable.update({
      where: { id: tableId },
      data: {
        status: TournamentTableStatus.COMPLETED,
        finishedAt: new Date(),
      },
    });

    if (game.isHighTable) {
      await this.tryFinalizeTournament(tournamentId);
      return this.refreshAndEmit(tournamentId);
    }

    await this.tryFinalizePrelims(tournamentId);
    return this.refreshAndEmit(tournamentId);
  }

  /**
   * Idempotent: if high table game is done, mark tournament COMPLETED.
   */
  async tryFinalizeTournament(tournamentId: string): Promise<void> {
    const t = await this.findFull(tournamentId);
    if (t.status === TournamentStatus.COMPLETED) return;
    if (t.status !== TournamentStatus.HIGH_TABLE) return;

    const high = t.tables.find(isHighTableRow);
    if (!high) return;
    if (!isTableCompleted(high)) return;

    await this.prisma.tournament.updateMany({
      where: {
        id: tournamentId,
        status: TournamentStatus.HIGH_TABLE,
      },
      data: {
        status: TournamentStatus.COMPLETED,
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Idempotent: if every prelim table is done and no high table exists, form it.
   * Safe to call from GET and onGameCompleted (recovery after crash/throw).
   */
  async tryFinalizePrelims(tournamentId: string): Promise<void> {
    const t = await this.findFull(tournamentId);
    if (
      t.status === TournamentStatus.HIGH_TABLE ||
      t.status === TournamentStatus.COMPLETED ||
      t.status === TournamentStatus.OPEN ||
      t.status === TournamentStatus.SEATED
    ) {
      return;
    }

    if (t.tables.some(isHighTableRow)) return;

    const prelim = t.tables.filter((tb) => tb.stage === TournamentStage.PRELIM);
    if (prelim.length === 0) return;

    if (!prelim.every(isTableCompleted)) return;

    await this.formHighTable(tournamentId);
  }

  private async formHighTable(tournamentId: string) {
    const t = await this.findFull(tournamentId);
    if (
      t.status === TournamentStatus.HIGH_TABLE ||
      t.status === TournamentStatus.COMPLETED
    ) {
      return;
    }
    const existingHigh = t.tables.find(
      (tb) => tb.stage === TournamentStage.HIGH_TABLE || tb.isHighTable,
    );
    if (existingHigh) return;

    const prelim = t.tables.filter((tb) => tb.stage === TournamentStage.PRELIM);

    type Qualifier = {
      tournamentPlayerId: string;
      sourceTableId: string;
      sourceTableNumber: number;
      sourcePlace: number;
      sourceScore: number;
    };

    const byPlace = new Map<number, Qualifier[]>();

    for (const table of prelim) {
      if (!table.game) {
        throw new BadRequestException(
          `Table ${table.tableNumber} has no completed game`,
        );
      }
      const standings = this.games.computeStandingsPublic(table.game);
      for (const s of standings) {
        const gp = table.game.players.find((p) => p.id === s.playerId);
        const resolved = this.resolveTournamentPlayer(
          t,
          gp?.tournamentPlayerId,
          s.playerName,
          `table ${table.tableNumber}`,
        );
        const q: Qualifier = {
          tournamentPlayerId: resolved.id,
          sourceTableId: table.id,
          sourceTableNumber: table.tableNumber,
          sourcePlace: s.place,
          sourceScore: s.total,
        };
        const list = byPlace.get(s.place) ?? [];
        list.push(q);
        byPlace.set(s.place, list);
      }
    }

    const target = Math.min(
      t.highTableSize,
      t.maxTableSize,
      t.players.length,
    );
    if (target < t.minTableSize) {
      throw new BadRequestException('Not enough players for high table');
    }

    const selected: Qualifier[] = [];
    const places = [...byPlace.keys()].sort((a, b) => a - b);
    for (const place of places) {
      if (selected.length >= target) break;
      const pool = (byPlace.get(place) ?? []).sort(
        (a, b) => b.sourceScore - a.sourceScore,
      );
      for (const q of pool) {
        if (selected.length >= target) break;
        if (selected.some((s) => s.tournamentPlayerId === q.tournamentPlayerId)) {
          continue;
        }
        selected.push(q);
      }
    }

    if (selected.length < t.minTableSize) {
      throw new BadRequestException('Could not fill high table');
    }

    // Seat by place then score; random dealer among them
    selected.sort((a, b) => {
      if (a.sourcePlace !== b.sourcePlace) return a.sourcePlace - b.sourcePlace;
      return b.sourceScore - a.sourceScore;
    });

    const dealerIdx = Math.floor(Math.random() * selected.length);
    const ordered = rotateDealerLast(selected, dealerIdx);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-check inside txn to shrink race window with concurrent prelim finishes
        const already = await tx.tournamentTable.findFirst({
          where: {
            tournamentId,
            stage: TournamentStage.HIGH_TABLE,
          },
        });
        if (already) return;

        await tx.tournamentTable.create({
          data: {
            tournamentId,
            tableNumber: 1,
            stage: TournamentStage.HIGH_TABLE,
            isHighTable: true,
            status: TournamentTableStatus.READY,
            dealerSeat: ordered.length - 1,
            seats: {
              create: ordered.map((q, seatIndex) => ({
                tournamentPlayerId: q.tournamentPlayerId,
                seatIndex,
                sourceTableId: q.sourceTableId,
                sourceTableNumber: q.sourceTableNumber,
                sourcePlace: q.sourcePlace,
                sourceScore: q.sourceScore,
              })),
            },
          },
        });
        await tx.tournament.update({
          where: { id: tournamentId },
          data: {
            status: TournamentStatus.HIGH_TABLE,
            highTableAt: new Date(),
          },
        });
      });
    } catch (e) {
      // Unique (tournamentId, tableNumber, stage) — concurrent former won
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.tournamentTable.findFirst({
          where: {
            tournamentId,
            OR: [{ stage: TournamentStage.HIGH_TABLE }, { isHighTable: true }],
          },
        });
        if (existing) return;
      }
      throw e;
    }
  }

  /**
   * Block prelim score edits once high table (or finals) exists so
   * qualification seats cannot silently diverge from live scores.
   */
  async assertPrelimEditable(tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        status: true,
        highTableAt: true,
        tables: {
          where: {
            OR: [{ stage: TournamentStage.HIGH_TABLE }, { isHighTable: true }],
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    if (
      t.status === TournamentStatus.HIGH_TABLE ||
      t.status === TournamentStatus.COMPLETED ||
      t.highTableAt != null ||
      t.tables.length > 0
    ) {
      throw new BadRequestException(
        'Cannot edit prelim scores after the high table has been formed',
      );
    }
  }

  /** True when prelim score edits must be blocked for UI consumers. */
  async isPrelimEditsLocked(tournamentId: string): Promise<boolean> {
    try {
      await this.assertPrelimEditable(tournamentId);
      return false;
    } catch (e) {
      if (e instanceof BadRequestException) return true;
      throw e;
    }
  }

  /** Push latest tournament detail to socket room (e.g. after linked game scores). */
  async emitUpdate(tournamentId: string) {
    const detail = this.toDetail(await this.findFull(tournamentId));
    this.realtime.emitTournament(tournamentId, detail);
    return detail;
  }

  private async refreshAndEmit(tournamentId: string) {
    const detail = await this.emitUpdate(tournamentId);
    this.realtime.emitTournamentList();
    return detail;
  }

  private async findFull(id: string): Promise<FullTournament> {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: tournamentInclude,
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  private toSummary(
    t: Prisma.TournamentGetPayload<{
      include: {
        players: true;
        tables: { include: { game: true } };
      };
    }>,
  ) {
    const tablesCompleted = t.tables.filter(
      (tb) =>
        tb.status === TournamentTableStatus.COMPLETED ||
        tb.game?.status === GameStatus.COMPLETED,
    ).length;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      targetPlayerCount: t.targetPlayerCount,
      playerCount: t.players.length,
      tableCount: t.tables.length,
      tablesCompleted,
      preferredTableSize: t.preferredTableSize,
      createdAt: t.createdAt,
      seatedAt: t.seatedAt,
      startedAt: t.startedAt,
      highTableAt: t.highTableAt,
      finishedAt: t.finishedAt,
    };
  }

  private toDetail(t: FullTournament) {
    const tables = t.tables.map((tb) => {
      const gameStandings = tb.game
        ? this.games.computeStandingsPublic(tb.game)
        : null;
      return {
        id: tb.id,
        tableNumber: tb.tableNumber,
        stage: tb.stage,
        isHighTable: tb.isHighTable,
        status: tb.status,
        dealerSeat: tb.dealerSeat,
        gameId: tb.game?.id ?? null,
        gameStatus: tb.game?.status ?? null,
        currentRound: tb.game ? currentRoundFromGame(tb.game) : null,
        startedAt: tb.startedAt,
        finishedAt: tb.finishedAt,
        seats: tb.seats.map((s) => ({
          id: s.id,
          seatIndex: s.seatIndex,
          tournamentPlayerId: s.tournamentPlayerId,
          name: s.tournamentPlayer.name,
          isDealer: s.seatIndex === tb.dealerSeat,
          sourceTableId: s.sourceTableId,
          sourceTableNumber: s.sourceTableNumber,
          sourcePlace: s.sourcePlace,
          sourceScore: s.sourceScore,
        })),
        standings: gameStandings,
      };
    });

    return {
      id: t.id,
      name: t.name,
      status: t.status,
      targetPlayerCount: t.targetPlayerCount,
      preferredTableSize: t.preferredTableSize,
      minTableSize: t.minTableSize,
      maxTableSize: t.maxTableSize,
      highTableSize: t.highTableSize,
      playerCount: t.players.length,
      createdAt: t.createdAt,
      seatedAt: t.seatedAt,
      startedAt: t.startedAt,
      highTableAt: t.highTableAt,
      finishedAt: t.finishedAt,
      players: t.players.map((p) => ({
        id: p.id,
        name: p.name,
        orderIndex: p.orderIndex,
        createdAt: p.createdAt,
      })),
      tables,
      finalStandings: this.computeFinalStandings(t),
      highTableError: null as string | null,
      ...this.proposedSeating(t),
    };
  }

  private proposedSeating(t: FullTournament): {
    proposedTableSizes: number[] | null;
    proposedTableSizesError: string | null;
  } {
    if (t.status !== TournamentStatus.OPEN || t.players.length < 2) {
      return { proposedTableSizes: null, proposedTableSizesError: null };
    }
    try {
      return {
        proposedTableSizes: balanceTableSizes(
          t.players.length,
          t.preferredTableSize,
          t.minTableSize,
          t.maxTableSize,
        ),
        proposedTableSizesError: null,
      };
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Cannot balance tables for this roster';
      return { proposedTableSizes: null, proposedTableSizesError: message };
    }
  }

  /**
   * Overall tournament places:
   * 1) High-table finish order (places 1..highTableSize)
   * 2) Remaining players by prelim place, then prelim score
   */
  private computeFinalStandings(t: FullTournament) {
    const high = t.tables.find(
      (tb) =>
        tb.isHighTable || tb.stage === TournamentStage.HIGH_TABLE,
    );
    const highDone =
      high?.status === TournamentTableStatus.COMPLETED ||
      high?.game?.status === GameStatus.COMPLETED;

    if (!highDone || !high?.game) {
      return null;
    }

    type Row = {
      tournamentPlayerId: string;
      name: string;
      place: number;
      score: number;
      source: 'HIGH_TABLE' | 'PRELIM';
      prelimPlace: number | null;
      prelimScore: number | null;
      prelimTableNumber: number | null;
      highTablePlace: number | null;
      highTableScore: number | null;
    };

    const highStandings = this.games.computeStandingsPublic(high.game);
    const placed = new Set<string>();
    const rows: Row[] = [];

    const sortedHigh = [...highStandings].sort((a, b) => {
      if (a.place !== b.place) return a.place - b.place;
      return b.total - a.total;
    });

    for (const s of sortedHigh) {
      const gp = high.game.players.find((p) => p.id === s.playerId);
      const resolved = this.resolveTournamentPlayer(
        t,
        gp?.tournamentPlayerId,
        s.playerName,
        'high table',
      );
      if (placed.has(resolved.id)) continue;
      placed.add(resolved.id);
      const seat = high.seats.find((x) => x.tournamentPlayerId === resolved.id);
      rows.push({
        tournamentPlayerId: resolved.id,
        name: resolved.name,
        place: 0,
        score: s.total,
        source: 'HIGH_TABLE',
        prelimPlace: seat?.sourcePlace ?? null,
        prelimScore: seat?.sourceScore ?? null,
        prelimTableNumber: seat?.sourceTableNumber ?? null,
        highTablePlace: s.place,
        highTableScore: s.total,
      });
    }

    type PrelimRow = {
      tournamentPlayerId: string;
      name: string;
      prelimPlace: number;
      prelimScore: number;
      prelimTableNumber: number;
    };
    const prelimRows: PrelimRow[] = [];
    const prelim = t.tables.filter((tb) => tb.stage === TournamentStage.PRELIM);

    for (const table of prelim) {
      if (!table.game) {
        throw new BadRequestException(
          `Prelim table ${table.tableNumber} has no game for final standings`,
        );
      }
      const standings = this.games.computeStandingsPublic(table.game);
      for (const s of standings) {
        const gp = table.game.players.find((p) => p.id === s.playerId);
        const resolved = this.resolveTournamentPlayer(
          t,
          gp?.tournamentPlayerId,
          s.playerName,
          `prelim table ${table.tableNumber}`,
        );
        if (placed.has(resolved.id)) continue;
        prelimRows.push({
          tournamentPlayerId: resolved.id,
          name: resolved.name,
          prelimPlace: s.place,
          prelimScore: s.total,
          prelimTableNumber: table.tableNumber,
        });
      }
    }

    prelimRows.sort((a, b) => {
      if (a.prelimPlace !== b.prelimPlace) return a.prelimPlace - b.prelimPlace;
      if (b.prelimScore !== a.prelimScore) return b.prelimScore - a.prelimScore;
      return a.name.localeCompare(b.name);
    });

    for (const p of prelimRows) {
      if (placed.has(p.tournamentPlayerId)) continue;
      placed.add(p.tournamentPlayerId);
      rows.push({
        tournamentPlayerId: p.tournamentPlayerId,
        name: p.name,
        place: 0,
        score: p.prelimScore,
        source: 'PRELIM',
        prelimPlace: p.prelimPlace,
        prelimScore: p.prelimScore,
        prelimTableNumber: p.prelimTableNumber,
        highTablePlace: null,
        highTableScore: null,
      });
    }

    // Dense-ish tournament place: sequential by order we built
    return rows.map((row, idx) => ({
      ...row,
      place: idx + 1,
    }));
  }

  private resolveTournamentPlayer(
    t: FullTournament,
    tournamentPlayerId: string | null | undefined,
    standingName: string,
    context: string,
  ): { id: string; name: string } {
    if (tournamentPlayerId) {
      const byId = t.players.find((p) => p.id === tournamentPlayerId);
      if (byId) return { id: byId.id, name: byId.name };
    }
    const byName = t.players.find(
      (p) => p.name.toLowerCase() === standingName.toLowerCase(),
    );
    if (!byName) {
      throw new BadRequestException(
        `Cannot map standing "${standingName}" on ${context} to a tournament player`,
      );
    }
    return { id: byName.id, name: byName.name };
  }
}

function isHighTableRow(tb: {
  stage: TournamentStage;
  isHighTable: boolean;
}): boolean {
  return tb.stage === TournamentStage.HIGH_TABLE || tb.isHighTable;
}

function isTableCompleted(tb: {
  status: TournamentTableStatus;
  game?: { status: GameStatus } | null;
}): boolean {
  return (
    tb.status === TournamentTableStatus.COMPLETED ||
    tb.game?.status === GameStatus.COMPLETED
  );
}

function currentRoundFromGame(game: {
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
  if (game.status === GameStatus.COMPLETED) return null;
  const rounds = [...game.rounds].sort((a, b) => a.number - b.number);
  for (const round of rounds) {
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
