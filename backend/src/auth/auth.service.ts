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
import { accountNameNeedles } from '../common/users';
import { bindUserToGameSeat } from '../games/claim-seat';
import { gameSeatInclude, seatedPlayers } from '../games/seats';

export type PublicUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; token: string }> {
    const username = normalizeUsername(dto.username);
    if (!username) throw badRequest('Username required');
    if (username.includes('@')) {
      throw badRequest('Username cannot be an email');
    }
    const firstName = normalizeName(dto.firstName);
    const lastName = normalizeName(dto.lastName);
    if (!firstName) throw badRequest('First name required');
    if (!lastName) throw badRequest('Last name required');
    const email = dto.email ? normalizeEmail(dto.email) : null;
    if (dto.email && !email) throw badRequest('Email required');

    await this.assertUsernameAvailable(username);
    if (email) await this.assertEmailAvailable(email);

    const passwordHash = await hashPassword(dto.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { username, firstName, lastName, email, passwordHash },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw uniqueConflict(e);
      }
      throw e;
    }
    const token = await this.createSession(user.id);
    return { user: toPublic(user), token };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; token: string }> {
    const identifier = dto.username.trim().toLowerCase();
    if (!identifier) {
      throw notFound(
        ApiErrorCode.USER_NOT_FOUND,
        'No account with that username or email',
      );
    }

    const user = await this.findByUsernameOrEmail(identifier);
    if (!user) {
      throw notFound(
        ApiErrorCode.USER_NOT_FOUND,
        'No account with that username or email',
      );
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
      include: { seats: gameSeatInclude },
    });
    if (!game) throw notFound(ApiErrorCode.GAME_NOT_FOUND, 'Game not found');

    const players = seatedPlayers(game.seats);
    const target = players.find((p) => p.id === playerId);
    if (!target) {
      throw notFound(ApiErrorCode.PLAYER_NOT_FOUND, 'Player not found in game');
    }
    if (target.userId) {
      if (target.userId === userId) {
        return { ok: true as const, alreadyClaimed: true as const };
      }
      throw conflict('That seat is already claimed');
    }

    const already = players.find((p) => p.userId === userId);
    if (already) {
      throw conflict(`You already claimed ${already.name} in this game`);
    }

    await bindUserToGameSeat(this.prisma, {
      gameId,
      guestPlayerId: playerId,
      userId,
      displayName: target.name,
    });

    return { ok: true as const, alreadyClaimed: false as const };
  }

  async listClaimableGames(
    userId: string,
    user: { username: string; firstName: string; lastName: string },
  ) {
    const needles = accountNameNeedles(user);
    const games = await this.prisma.game.findMany({
      where: {
        seats: {
          some: { player: { userId: null } },
          none: { player: { userId } },
        },
      },
      include: {
        seats: gameSeatInclude,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return games
      .filter((g) =>
        seatedPlayers(g.seats).some(
          (p) =>
            p.userId === null &&
            needles.includes(p.name.trim().toLowerCase()),
        ),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        playMode: g.playMode,
        createdAt: g.createdAt,
        finishedAt: g.finishedAt,
        players: seatedPlayers(g.seats).map((p) => ({
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

  private async findByUsernameOrEmail(identifier: string) {
    const byUsername = await this.prisma.user.findUnique({
      where: { username: identifier },
    });
    if (byUsername) return byUsername;
    return this.prisma.user.findUnique({
      where: { email: identifier },
    });
  }

  private async assertUsernameAvailable(username: string) {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw conflict('Username already taken', ApiErrorCode.USERNAME_TAKEN);
    }
  }

  private async assertEmailAvailable(email: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw conflict('Email already in use', ApiErrorCode.EMAIL_TAKEN);
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

function uniqueConflict(e: unknown) {
  const target = uniqueTarget(e);
  if (target.includes('email')) {
    return conflict('Email already in use', ApiErrorCode.EMAIL_TAKEN);
  }
  return conflict('Username already taken', ApiErrorCode.USERNAME_TAKEN);
}

function uniqueTarget(e: unknown): string[] {
  if (typeof e !== 'object' || e === null || !('meta' in e)) return [];
  const meta = (e as { meta?: { target?: unknown } }).meta;
  if (!meta || !Array.isArray(meta.target)) return [];
  return meta.target.filter((t): t is string => typeof t === 'string');
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeName(raw: string): string {
  return raw.trim();
}

function toPublic(user: {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
  };
}
