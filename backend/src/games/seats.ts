import type { Prisma } from '@prisma/client';

export const gameSeatInclude = {
  orderBy: { seatIndex: 'asc' as const },
  include: { player: true },
} satisfies Prisma.GamePlayerFindManyArgs;

export type GameSeatRow = Prisma.GamePlayerGetPayload<{
  include: { player: true };
}>;

export type SeatedPlayer = {
  id: string;
  name: string;
  seatIndex: number;
  userId: string | null;
};

export function seatedPlayers(seats: GameSeatRow[]): SeatedPlayer[] {
  return seats.map((s) => ({
    id: s.player.id,
    name: s.player.name,
    seatIndex: s.seatIndex,
    userId: s.player.userId,
  }));
}

export function withSeatedPlayers<T extends { seats: GameSeatRow[] }>(
  game: T,
): T & { players: SeatedPlayer[] } {
  return { ...game, players: seatedPlayers(game.seats) };
}