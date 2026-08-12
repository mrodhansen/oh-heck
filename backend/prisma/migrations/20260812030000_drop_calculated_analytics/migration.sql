-- Drop derived analytics columns. Read path computes these from raw bids/tricks/points.

DROP INDEX IF EXISTS "RoundEntry_made_idx";

ALTER TABLE "Game" DROP COLUMN "durationMs";
ALTER TABLE "Game" DROP COLUMN "winnerPlayerId";
ALTER TABLE "Game" DROP COLUMN "winnerScore";
ALTER TABLE "Game" DROP COLUMN "runnerUpScore";
ALTER TABLE "Game" DROP COLUMN "winMargin";
ALTER TABLE "Game" DROP COLUMN "totalForceBurns";
ALTER TABLE "Game" DROP COLUMN "totalEdits";

ALTER TABLE "Round" DROP COLUMN "bidSum";
ALTER TABLE "Round" DROP COLUMN "bidDeficit";
ALTER TABLE "Round" DROP COLUMN "forbiddenLastBid";

ALTER TABLE "RoundEntry" DROP COLUMN "made";
ALTER TABLE "RoundEntry" DROP COLUMN "trickDelta";
ALTER TABLE "RoundEntry" DROP COLUMN "absDelta";
ALTER TABLE "RoundEntry" DROP COLUMN "isNilBid";
ALTER TABLE "RoundEntry" DROP COLUMN "isNilMade";
ALTER TABLE "RoundEntry" DROP COLUMN "cumulativeScore";
ALTER TABLE "RoundEntry" DROP COLUMN "placeAfterRound";
ALTER TABLE "RoundEntry" DROP COLUMN "scoreBehindLeader";
