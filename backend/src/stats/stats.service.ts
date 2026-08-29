import { Injectable } from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildStats } from './stats-aggregate';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const games = await this.prisma.game.findMany({
      where: { status: GameStatus.COMPLETED },
      include: {
        seats: {
          orderBy: { seatIndex: 'asc' },
          include: {
            player: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        rounds: { include: { entries: true }, orderBy: { number: 'asc' } },
        tournamentTable: { select: { isHighTable: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...buildStats(games, 'users'),
      allPlayers: buildStats(games, 'players'),
    };
  }
}
