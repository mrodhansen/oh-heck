/** Build bid/trick API payloads; hard-fail if any player key is missing. */

export function buildBidPayload(
  players: { id: string; name: string }[],
  locked: Record<string, number>,
): { playerId: string; bid: number }[] {
  return players.map((p) => {
    const bid = locked[p.id];
    if (bid === undefined) {
      throw new Error(`Missing bid for ${p.name}`);
    }
    return { playerId: p.id, bid };
  });
}

export function buildTrickPayload(
  playerIds: string[],
  locked: Record<string, number>,
): { playerId: string; tricksTaken: number }[] {
  return playerIds.map((playerId) => {
    const tricksTaken = locked[playerId];
    if (tricksTaken === undefined) {
      throw new Error('Missing tricks for a player');
    }
    return { playerId, tricksTaken };
  });
}
