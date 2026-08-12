export type OhHeckRules = {
  meta: {
    name: string;
    players: { min: number; max: number };
    rounds: number;
    deck: string;
  };
  hand_sizes: number[];
  goal?: string;
  you_need?: string;
  setup: {
    seating: string;
    dealing: string;
    trump: string;
  };
  bidding: {
    how_to_bid: string;
    the_hook: string;
    example: string;
  };
  play: {
    leading: string;
    following_suit: string;
    winning_a_trick: string;
  };
  scoring: {
    if_you_make_it: string;
    if_you_miss: string;
    who_wins: string;
  };
  notes?: {
    tricks_add_up: string;
    force_burn: string;
  };
};
