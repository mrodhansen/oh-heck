import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';
import type { LoginDto, RegisterDto, UpdateAccountDto } from './dto';
import {
  ApiErrorCode,
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from '../common/api-error';

export type PublicUser = {
  id: string;
  username: string;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; token: string }> {
    const username = normalizeUsername(dto.username);
    if (!username) throw badRequest('Username required');
    await this.assertUsernameAvailable(username);

    const passwordHash = await hashPassword(dto.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { username, passwordHash },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('Username already taken', ApiErrorCode.USERNAME_TAKEN);
      }
      throw e;
    }
    const token = await this.createSession(user.id);
    return { user: toPublic(user), token };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; token: string }> {
    const username = normalizeUsername(dto.username);
    if (!username) {
      throw notFound(ApiErrorCode.USER_NOT_FOUND, 'No account with that username');
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw notFound(ApiErrorCode.USER_NOT_FOUND, 'No account with that username');
    }

    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      throw unauthorized('Incorrect password', ApiErrorCode.INVALID_CREDENTIALS);
    }

    const token = await this.createSession(user.id);
    return { user: toPublic(user), token };
  }

  async logout(token: string | null) {
    if (!token) return;
    await this.prisma.authSession.deleteMany({ where: { token } });
  }

  async userFromToken(token: string | null): Promise<PublicUser | null> {
    if (!token) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.authSession.delete({ where: { id: session.id } });
      return null;
    }
    return toPublic(session.user);
  }

  async updateAccount(
    userId: string,
    dto: UpdateAccountDto,
  ): Promise<PublicUser> {
    if (!dto.password.length) {
      throw badRequest('Password required');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.password) },
    });
    return toPublic(user);
  }

  async claimGamePlayer(userId: string, gameId: string, playerId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { orderBy: { seatIndex: 'asc' } } },
    });
    if (!game) throw notFound(ApiErrorCode.GAME_NOT_FOUND, 'Game not found');

    const target = game.players.find((p) => p.id === playerId);
    if (!target) {
      throw notFound(ApiErrorCode.PLAYER_NOT_FOUND, 'Player not found in game');
    }
    if (target.userId) {
      if (target.userId === userId) {
        return { ok: true as const, alreadyClaimed: true as const };
      }
      throw conflict('That seat is already claimed');
    }

    const already = game.players.find((p) => p.userId === userId);
    if (already) {
      throw conflict(`You already claimed ${already.name} in this game`);
    }

    // Link the account only. Keep the originally entered table name.
    await this.prisma.player.update({
      where: { id: playerId },
      data: { userId },
    });

    return { ok: true as const, alreadyClaimed: false as const };
  }

  async listClaimableGames(userId: string, username: string) {
    const needle = username.trim().toLowerCase();
    const games = await this.prisma.game.findMany({
      where: {
        players: {
          some: { userId: null },
          none: { userId },
        },
      },
      include: {
        players: { orderBy: { seatIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return games
      .filter((g) =>
        g.players.some(
          (p) =>
            p.userId === null && p.name.trim().toLowerCase() === needle,
        ),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        playMode: g.playMode,
        createdAt: g.createdAt,
        finishedAt: g.finishedAt,
        players: g.players.map((p) => ({
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
          userId: p.userId,
          claimable: p.userId === null,
        })),
      }));
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.authSession.create({
      data: { userId, token, expiresAt: null },
    });
    return token;
  }

  private async assertUsernameAvailable(username: string) {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw conflict('Username already taken', ApiErrorCode.USERNAME_TAKEN);
    }
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: string }).code === 'P2002'
  );
}

function normalizeUsername(raw: string): string {
  // Lowercase so uniqueness is case-insensitive.
  return raw.trim().toLowerCase();
}

function toPublic(user: {
  id: string;
  username: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  };
}
