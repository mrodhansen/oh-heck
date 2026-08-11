export type LiveCard = {
  key: string;
  suit: 'C' | 'D' | 'H' | 'S';
  rank: string;
};

export type LivePlayerPublic = {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  gone: boolean;
};

export type LiveBidRow = {
  playerId: string;
  seatIndex: number;
  name: string;
  bid: number | null;
  tricksTaken: number | null;
};

export type LiveView = {
  id: string;
  code: string;
  status: 'LOBBY' | 'PLAYING' | 'COMPLETED';
  hostPlayerId: string | null;
  gameId: string | null;
  me: {
    playerId: string;
    name: string;
    seatIndex: number;
    isHost: boolean;
    gone: boolean;
  };
  players: LivePlayerPublic[];
  phase: 'lobby' | 'bidding' | 'playing' | 'trick_reveal' | 'complete';
  roundNumber: number | null;
  handSize: number | null;
  dealerSeat: number | null;
  trumpSuit: LiveCard['suit'] | null;
  trumpCard: { s: LiveCard['suit']; r: string } | null;
  forceBurn: boolean;
  bids: LiveBidRow[];
  turnSeat: number | null;
  bidderSeat: number | null;
  isMyTurn: boolean;
  isMyBidTurn: boolean;
  forbiddenLastBid: number | null;
  priorBidSum: number | null;
  hand: LiveCard[];
  legalCardKeys: string[];
  table: {
    plays: {
      seat: number;
      playerId: string | null;
      card: LiveCard;
    }[];
    leadSuit: LiveCard['suit'] | null;
    winnerSeat: number | null;
    complete: boolean;
  };
  tricksPlayed: number;
  maxPlayers: number;
  minPlayers: number;
  canStart: boolean;
  goneCount: number;
};

export type LiveGoneSeat = {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
};

export type LiveLookup = {
  id: string;
  code: string;
  status: 'LOBBY' | 'PLAYING';
  playerCount: number;
  presentCount: number;
  maxPlayers: number;
  gonePlayers: LiveGoneSeat[];
};

export type LiveAuth = {
  sessionId: string;
  playerId: string;
  token: string;
  name: string;
  code: string;
};
