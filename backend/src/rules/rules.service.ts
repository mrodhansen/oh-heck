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
  setup: Record<string, string>;
  bidding: Record<string, string>;
  play: Record<string, string>;
  scoring: Record<string, string>;
  validation: Record<string, string>;
};

@Injectable()
export class RulesService implements OnModuleInit {
  private rules!: OhHeckRules;

  onModuleInit() {
    // Prefer backend flat hand_sizes array format only (not root RULES.yaml object form).
    const candidates = [
      join(__dirname, 'rules', 'oh-heck.yaml'),
      join(__dirname, '..', 'rules', 'oh-heck.yaml'),
      join(process.cwd(), 'rules', 'oh-heck.yaml'),
    ];
    const path = candidates.find((p) => existsSync(p));
    if (!path) {
      throw new Error('Oh Heck rules file not found');
    }
    const raw = load(readFileSync(path, 'utf8')) as OhHeckRules;
    if (!Array.isArray(raw.hand_sizes) || raw.hand_sizes.length !== 13) {
      throw new Error('Rules must define exactly 13 hand sizes');
    }
    this.rules = raw;
  }

  getRules(): OhHeckRules {
    return this.rules;
  }

  getHandSize(roundNumber: number): number {
    if (roundNumber < 1 || roundNumber > this.rules.meta.rounds) {
      throw new Error(`Round must be 1–${this.rules.meta.rounds}`);
    }
    return this.rules.hand_sizes[roundNumber - 1];
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
