import { PrismaService } from '../prisma/prisma.service';
import { ApiErrorCode, notFound } from './api-error';

export function accountDisplayName(user: {
  firstName: string;
  lastName: string;
}): string {
  return `${user.firstName} ${user.lastName}`.replace(/\s+/g, ' ').trim();
}

export function accountNameNeedles(user: {
  username: string;
  firstName: string;
  lastName: string;
}): string[] {
  const names = [
    user.username,
    user.firstName,
    accountDisplayName(user),
  ]
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

export async function assertUsersExist(
  prisma: PrismaService,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const found = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found');
  }
}

export async function resolveExistingUserId(
  prisma: PrismaService,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found');
  }
  return user.id;
}
