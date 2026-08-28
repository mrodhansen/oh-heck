import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiErrorCode, notFound } from '../common/api-error';

/** Guest row can take userId only when it is not seated in any other game. */
export function shouldStampGuestUserId(otherGameSeatCount: number): boolean {
  if (otherGameSeatCount < 0) {
    throw new Error('otherGameSeatCount must be >= 0');
  }
  return otherGameSeatCount === 0;
}

/**
 * Bind this user to one game seat. Never stamps userId onto a Player who
 * still sits in other games — that would claim every table that person played.
 */
export async function bindUserToGameSeat(
  prisma: PrismaService,
  args: {
    gameId: string;
    guestPlayerId: string;
    userId: string;
    displayName: string;
  },
): Promise<void> {
  const { gameId, guestPlayerId, userId, displayName } = args;

  await prisma.$transaction(async (tx) => {
    let mine = await tx.player.findUnique({ where: { userId } });
    if (!mine) {
      const otherSeats = await tx.gamePlayer.count({
        where: { playerId: guestPlayerId, gameId: { not: gameId } },
      });
      if (shouldStampGuestUserId(otherSeats)) {
        await tx.player.update({
          where: { id: guestPlayerId },
          data: { userId },
        });
        return;
      }
      mine = await tx.player.create({
        data: { name: displayName, userId },
      });
    }
    if (mine.id === guestPlayerId) return;

    await remapGamePlayer(tx, {
      gameId,
      fromPlayerId: guestPlayerId,
      toPlayerId: mine.id,
    });
  });
}

async function remapGamePlayer(
  tx: Prisma.TransactionClient,
  args: { gameId: string; fromPlayerId: string; toPlayerId: string },
): Promise<void> {
  const { gameId, fromPlayerId, toPlayerId } = args;
  const seat = await tx.gamePlayer.findFirst({
    where: { gameId, playerId: fromPlayerId },
  });
  if (!seat) {
    throw notFound(ApiErrorCode.PLAYER_NOT_FOUND, 'Player not found in game');
  }
  await tx.gamePlayer.update({
    where: { id: seat.id },
    data: { playerId: toPlayerId },
  });
  await tx.roundEntry.updateMany({
    where: { playerId: fromPlayerId, round: { gameId } },
    data: { playerId: toPlayerId },
  });
  await tx.trickPlay.updateMany({
    where: { playerId: fromPlayerId, trick: { gameId } },
    data: { playerId: toPlayerId },
  });
  await tx.trick.updateMany({
    where: { winnerPlayerId: fromPlayerId, gameId },
    data: { winnerPlayerId: toPlayerId },
  });
  await tx.round.updateMany({
    where: { gameId, dealerPlayerId: fromPlayerId },
    data: { dealerPlayerId: toPlayerId },
  });
  await tx.round.updateMany({
    where: { gameId, firstBidderPlayerId: fromPlayerId },
    data: { firstBidderPlayerId: toPlayerId },
  });
}
