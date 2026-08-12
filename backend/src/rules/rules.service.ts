import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

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
  validation?: {
    [key: string]: string;
  };
};

@Injectable()
export class RulesService implements OnModuleInit {
  private rules!: OhHeckRules;

  onModuleInit() {
    // Flat hand_sizes array (13 numbers). Technical notes: docs/RULES.technical.yaml
    const candidates = [
      join(__dirname, 'rules', 'oh-heck.yaml'),
      join(__dirname, '..', 'rules', 'oh-heck.yaml'),
      join(process.cwd(), 'rules', 'oh-heck.yaml'),
    ];
    const path = candidates.find((p) => existsSync(p));
    if (!path) {
      throw new Error('Oh Heck rules file not found');
    }
    const raw: unknown = load(readFileSync(path, 'utf8'));
    this.rules = parseRules(raw);
  }

  getRules(): OhHeckRules {
    return this.rules;
  }

  getHandSize(roundNumber: number): number {
    if (roundNumber < 1 || roundNumber > this.rules.meta.rounds) {
      throw new Error(`Round must be 1–${this.rules.meta.rounds}`);
    }
    const size = this.rules.hand_sizes[roundNumber - 1];
    if (size === undefined) {
      throw new Error(`Missing hand size for round ${roundNumber}`);
    }
    return size;
  }

  getTotalRounds(): number {
    return this.rules.meta.rounds;
  }

  getPlayerLimits(): { min: number; max: number } {
    return this.rules.meta.players;
  }

  /** Round 1 dealer = last seat; then rotates forward each round. */
  dealerSeat(roundNumber: number, playerCount: number): number {
    return (playerCount - 1 + roundNumber - 1) % playerCount;
  }

  /** Bid order starts left of dealer. */
  bidOrderSeats(roundNumber: number, playerCount: number): number[] {
    const dealer = this.dealerSeat(roundNumber, playerCount);
    const order: number[] = [];
    for (let i = 1; i <= playerCount; i++) {
      order.push((dealer + i) % playerCount);
    }
    return order;
  }

  forbiddenLastBid(priorBidsSum: number, handSize: number): number | null {
    const forbidden = handSize - priorBidsSum;
    if (forbidden < 0 || forbidden > handSize) {
      return null;
    }
    return forbidden;
  }

  scoreRound(bid: number, tricksTaken: number): number {
    if (bid === tricksTaken) {
      return 5 + tricksTaken;
    }
    return -Math.abs(bid - tricksTaken);
  }
}

function isStringRecord(value: unknown): value is { [key: string]: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

function hasStringKeys(
  value: unknown,
  keys: readonly string[],
): value is { [key: string]: string } {
  if (!isStringRecord(value)) return false;
  return keys.every((k) => typeof value[k] === 'string');
}

function parseRules(raw: unknown): OhHeckRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid rules file');
  }
  if (!('meta' in raw) || !raw.meta || typeof raw.meta !== 'object') {
    throw new Error('Rules missing meta');
  }
  const meta = raw.meta as { [key: string]: unknown };
  if (typeof meta.name !== 'string' || typeof meta.deck !== 'string') {
    throw new Error('Rules meta.name and meta.deck required');
  }
  if (!meta.players || typeof meta.players !== 'object' || Array.isArray(meta.players)) {
    throw new Error('Rules meta.players required');
  }
  const players = meta.players as { [key: string]: unknown };
  if (typeof players.min !== 'number' || typeof players.max !== 'number') {
    throw new Error('Rules meta.players.min/max required');
  }
  if (typeof meta.rounds !== 'number') {
    throw new Error('Rules meta.rounds required');
  }
  if (!('hand_sizes' in raw) || !Array.isArray(raw.hand_sizes) || raw.hand_sizes.length !== 13) {
    throw new Error('Rules must define exactly 13 hand sizes');
  }
  if (!raw.hand_sizes.every((n): n is number => typeof n === 'number')) {
    throw new Error('Rules hand_sizes must be numbers');
  }
  const setup = 'setup' in raw ? raw.setup : undefined;
  const bidding = 'bidding' in raw ? raw.bidding : undefined;
  const play = 'play' in raw ? raw.play : undefined;
  const scoring = 'scoring' in raw ? raw.scoring : undefined;
  const notes = 'notes' in raw ? raw.notes : undefined;
  const validation = 'validation' in raw ? raw.validation : undefined;
  if (!hasStringKeys(setup, ['seating', 'dealing', 'trump'])) {
    throw new Error('Rules setup is incomplete');
  }
  if (!hasStringKeys(bidding, ['how_to_bid', 'the_hook', 'example'])) {
    throw new Error('Rules bidding is incomplete');
  }
  if (!hasStringKeys(play, ['leading', 'following_suit', 'winning_a_trick'])) {
    throw new Error('Rules play is incomplete');
  }
  if (!hasStringKeys(scoring, ['if_you_make_it', 'if_you_miss', 'who_wins'])) {
    throw new Error('Rules scoring is incomplete');
  }

  return {
    meta: {
      name: meta.name,
      players: { min: players.min, max: players.max },
      rounds: meta.rounds,
      deck: meta.deck,
    },
    hand_sizes: raw.hand_sizes,
    goal: 'goal' in raw && typeof raw.goal === 'string' ? raw.goal : undefined,
    you_need:
      'you_need' in raw && typeof raw.you_need === 'string'
        ? raw.you_need
        : undefined,
    setup: {
      seating: setup.seating,
      dealing: setup.dealing,
      trump: setup.trump,
    },
    bidding: {
      how_to_bid: bidding.how_to_bid,
      the_hook: bidding.the_hook,
      example: bidding.example,
    },
    play: {
      leading: play.leading,
      following_suit: play.following_suit,
      winning_a_trick: play.winning_a_trick,
    },
    scoring: {
      if_you_make_it: scoring.if_you_make_it,
      if_you_miss: scoring.if_you_miss,
      who_wins: scoring.who_wins,
    },
    notes: hasStringKeys(notes, ['tricks_add_up', 'force_burn'])
      ? {
          tricks_add_up: notes.tricks_add_up,
          force_burn: notes.force_burn,
        }
      : undefined,
    validation: isStringRecord(validation) ? validation : undefined,
  };
}
