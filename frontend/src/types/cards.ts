export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type CardJson = {
  s: Suit;
  r: Rank;
};

export type CardPlayRecord = {
  trickIndex: number;
  playOrder: number;
  s: Suit;
  r: Rank;
  key: string;
};

export type DealtHandsJson = {
  bySeat: CardJson[][];
  byPlayerId: { [playerId: string]: CardJson[] };
};

export type TrickHistoryPlay = {
  playOrder: number;
  seatIndex: number;
  playerId: string;
  card: { s: Suit; r: Rank; key: string };
  followedSuit: boolean;
  playedTrump: boolean;
};

export type TrickHistoryEntry = {
  trickIndex: number;
  leadSeat: number;
  leadSuit: Suit;
  winnerSeat: number;
  winnerPlayerId: string | null;
  plays: TrickHistoryPlay[];
};

export type CurrentTrickPlay = {
  playOrder: number;
  seatIndex: number;
  playerId: string;
  s: Suit;
  r: Rank;
  key: string;
  followedSuit: boolean;
  playedTrump: boolean;
};

export type CurrentTrickJson = {
  leadSeat: number;
  plays: CurrentTrickPlay[];
};


