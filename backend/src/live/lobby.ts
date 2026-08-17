import { BadRequestException } from '@nestjs/common';

export type LobbySeat = {
  id: string;
  name: string;
  token: string;
  seatIndex: number;
  isHost: boolean;
  gone: boolean;
  userId: string | null;
};

export function parseLobby(value: unknown): LobbySeat[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('Corrupt live lobby');
  }
  const out: LobbySeat[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException('Corrupt live lobby');
    }
    const rec = item as { readonly [key: string]: unknown };
    if (typeof rec.id !== 'string' || !rec.id) {
      throw new BadRequestException('Corrupt live lobby');
    }
    if (typeof rec.name !== 'string') {
      throw new BadRequestException('Corrupt live lobby');
    }
    if (typeof rec.token !== 'string' || !rec.token) {
      throw new BadRequestException('Corrupt live lobby');
    }
    if (typeof rec.seatIndex !== 'number' || !Number.isInteger(rec.seatIndex)) {
      throw new BadRequestException('Corrupt live lobby');
    }
    if (typeof rec.isHost !== 'boolean' || typeof rec.gone !== 'boolean') {
      throw new BadRequestException('Corrupt live lobby');
    }
    const userId =
      rec.userId == null
        ? null
        : typeof rec.userId === 'string'
          ? rec.userId
          : null;
    if (rec.userId != null && userId == null) {
      throw new BadRequestException('Corrupt live lobby');
    }
    out.push({
      id: rec.id,
      name: rec.name,
      token: rec.token,
      seatIndex: rec.seatIndex,
      isHost: rec.isHost,
      gone: rec.gone,
      userId,
    });
  }
  return out.sort((a, b) => a.seatIndex - b.seatIndex);
}
