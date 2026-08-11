-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('GAME_CREATED', 'BIDS_SET', 'TRICKS_SET', 'ROUND_UPDATED');

-- AlterTable Game
ALTER TABLE "Game" ADD COLUMN "playerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "firstDealerSeat" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "Game" ADD COLUMN "winnerPlayerId" TEXT;
ALTER TABLE "Game" ADD COLUMN "winnerScore" INTEGER;
ALTER TABLE "Game" ADD COLUMN "runnerUpScore" INTEGER;
ALTER TABLE "Game" ADD COLUMN "winMargin" INTEGER;
ALTER TABLE "Game" ADD COLUMN "totalForceBurns" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "totalEdits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Round
ALTER TABLE "Round" ADD COLUMN "firstBidderSeat" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Round" ADD COLUMN "dealerPlayerId" TEXT;
ALTER TABLE "Round" ADD COLUMN "firstBidderPlayerId" TEXT;
ALTER TABLE "Round" ADD COLUMN "bidOrderSeats" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Round" ADD COLUMN "bidSum" INTEGER;
ALTER TABLE "Round" ADD COLUMN "bidDeficit" INTEGER;
ALTER TABLE "Round" ADD COLUMN "forbiddenLastBid" INTEGER;
ALTER TABLE "Round" ADD COLUMN "bidsCompletedAt" TIMESTAMP(3);
ALTER TABLE "Round" ADD COLUMN "tricksCompletedAt" TIMESTAMP(3);
ALTER TABLE "Round" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Round" ADD COLUMN "editCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable RoundEntry
ALTER TABLE "RoundEntry" ADD COLUMN "bidPosition" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "isDealer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoundEntry" ADD COLUMN "isFirstBidder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoundEntry" ADD COLUMN "isLastBidder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoundEntry" ADD COLUMN "runningBidBefore" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "made" BOOLEAN;
ALTER TABLE "RoundEntry" ADD COLUMN "trickDelta" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "absDelta" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "isNilBid" BOOLEAN;
ALTER TABLE "RoundEntry" ADD COLUMN "isNilMade" BOOLEAN;
ALTER TABLE "RoundEntry" ADD COLUMN "cumulativeScore" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "placeAfterRound" INTEGER;
ALTER TABLE "RoundEntry" ADD COLUMN "scoreBehindLeader" INTEGER;

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" "GameEventType" NOT NULL,
    "roundNumber" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");
CREATE INDEX "Game_finishedAt_idx" ON "Game"("finishedAt");
CREATE INDEX "RoundEntry_made_idx" ON "RoundEntry"("made");
CREATE INDEX "RoundEntry_isDealer_idx" ON "RoundEntry"("isDealer");
CREATE INDEX "RoundEntry_bidPosition_idx" ON "RoundEntry"("bidPosition");
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");
CREATE INDEX "GameEvent_gameId_type_idx" ON "GameEvent"("gameId", "type");
CREATE INDEX "GameEvent_type_idx" ON "GameEvent"("type");

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Game.playerCount / firstDealerSeat
UPDATE "Game" g
SET
  "playerCount" = sub.cnt,
  "firstDealerSeat" = GREATEST(sub.cnt - 1, 0),
  "startedAt" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "Round" r
      JOIN "RoundEntry" e ON e."roundId" = r.id
      WHERE r."gameId" = g.id AND e.bid IS NOT NULL
    ) THEN g."createdAt"
    ELSE NULL
  END,
  "durationMs" = CASE
    WHEN g."finishedAt" IS NOT NULL
    THEN (EXTRACT(EPOCH FROM (g."finishedAt" - g."createdAt")) * 1000)::INTEGER
    ELSE NULL
  END,
  "totalForceBurns" = (
    SELECT COUNT(*)::INTEGER FROM "Round" r
    WHERE r."gameId" = g.id AND r."forceBurn" = true
  )
FROM (
  SELECT p."gameId", COUNT(*)::INTEGER AS cnt
  FROM "Player" p
  GROUP BY p."gameId"
) sub
WHERE g.id = sub."gameId";

-- Backfill Round seating / bid-order metadata + bid aggregates
UPDATE "Round" r
SET
  "firstBidderSeat" = CASE
    WHEN g."playerCount" > 0 THEN (r."dealerSeat" + 1) % g."playerCount"
    ELSE 0
  END,
  "dealerPlayerId" = (
    SELECT p.id FROM "Player" p
    WHERE p."gameId" = r."gameId" AND p."seatIndex" = r."dealerSeat"
    LIMIT 1
  ),
  "firstBidderPlayerId" = (
    SELECT p.id FROM "Player" p
    WHERE p."gameId" = r."gameId"
      AND p."seatIndex" = CASE
        WHEN g."playerCount" > 0 THEN (r."dealerSeat" + 1) % g."playerCount"
        ELSE 0
      END
    LIMIT 1
  ),
  "bidOrderSeats" = (
    SELECT COALESCE(array_agg(seat ORDER BY ord), ARRAY[]::INTEGER[])
    FROM (
      SELECT
        generate_series AS ord,
        (r."dealerSeat" + generate_series) % GREATEST(g."playerCount", 1) AS seat
      FROM generate_series(1, GREATEST(g."playerCount", 1))
    ) s
  ),
  "bidSum" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "RoundEntry" e
      WHERE e."roundId" = r.id AND e.bid IS NULL
    ) THEN NULL
    ELSE (
      SELECT SUM(e.bid)::INTEGER FROM "RoundEntry" e WHERE e."roundId" = r.id
    )
  END,
  "bidDeficit" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "RoundEntry" e
      WHERE e."roundId" = r.id AND e.bid IS NULL
    ) THEN NULL
    ELSE r."handSize" - (
      SELECT SUM(e.bid)::INTEGER FROM "RoundEntry" e WHERE e."roundId" = r.id
    )
  END,
  "bidsCompletedAt" = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "RoundEntry" e
      WHERE e."roundId" = r.id AND e.bid IS NULL
    ) THEN r."updatedAt"
    ELSE NULL
  END,
  "tricksCompletedAt" = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "RoundEntry" e
      WHERE e."roundId" = r.id AND (e."tricksTaken" IS NULL OR e.points IS NULL)
    ) THEN r."updatedAt"
    ELSE NULL
  END,
  "completedAt" = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "RoundEntry" e
      WHERE e."roundId" = r.id AND (e.bid IS NULL OR e."tricksTaken" IS NULL OR e.points IS NULL)
    ) THEN r."updatedAt"
    ELSE NULL
  END
FROM "Game" g
WHERE g.id = r."gameId";

-- forbiddenLastBid when all bids present: handSize - sum(all but dealer last in order)
UPDATE "Round" r
SET "forbiddenLastBid" = sub.forbidden
FROM (
  SELECT
    r2.id AS round_id,
    CASE
      WHEN g."playerCount" < 1 THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM "RoundEntry" e WHERE e."roundId" = r2.id AND e.bid IS NULL
      ) THEN NULL
      ELSE (
        SELECT
          CASE
            WHEN (r2."handSize" - COALESCE(SUM(e.bid), 0)) BETWEEN 0 AND r2."handSize"
            THEN (r2."handSize" - COALESCE(SUM(e.bid), 0))
            ELSE NULL
          END
        FROM "RoundEntry" e
        JOIN "Player" p ON p.id = e."playerId"
        WHERE e."roundId" = r2.id
          AND p."seatIndex" <> r2."dealerSeat"
      )
    END AS forbidden
  FROM "Round" r2
  JOIN "Game" g ON g.id = r2."gameId"
) sub
WHERE r.id = sub.round_id
  AND NOT EXISTS (
    SELECT 1 FROM "RoundEntry" e WHERE e."roundId" = r.id AND e.bid IS NULL
  );

-- Backfill RoundEntry role flags + bid position + outcome metrics
UPDATE "RoundEntry" e
SET
  "bidPosition" = sub.bid_pos,
  "isDealer" = sub.is_dealer,
  "isFirstBidder" = sub.is_first,
  "isLastBidder" = sub.is_last,
  "runningBidBefore" = CASE WHEN e.bid IS NOT NULL THEN sub.running_before ELSE NULL END,
  "made" = CASE
    WHEN e.bid IS NOT NULL AND e."tricksTaken" IS NOT NULL
    THEN e.bid = e."tricksTaken"
    ELSE NULL
  END,
  "trickDelta" = CASE
    WHEN e.bid IS NOT NULL AND e."tricksTaken" IS NOT NULL
    THEN e."tricksTaken" - e.bid
    ELSE NULL
  END,
  "absDelta" = CASE
    WHEN e.bid IS NOT NULL AND e."tricksTaken" IS NOT NULL
    THEN ABS(e."tricksTaken" - e.bid)
    ELSE NULL
  END,
  "isNilBid" = CASE WHEN e.bid IS NOT NULL THEN e.bid = 0 ELSE NULL END,
  "isNilMade" = CASE
    WHEN e.bid IS NOT NULL AND e."tricksTaken" IS NOT NULL
    THEN e.bid = 0 AND e."tricksTaken" = 0
    ELSE NULL
  END
FROM (
  SELECT
    e2.id AS entry_id,
    (
      SELECT idx - 1
      FROM unnest(r."bidOrderSeats") WITH ORDINALITY AS u(seat, idx)
      WHERE u.seat = p."seatIndex"
      LIMIT 1
    ) AS bid_pos,
    (p."seatIndex" = r."dealerSeat") AS is_dealer,
    (p."seatIndex" = r."firstBidderSeat") AS is_first,
    (p."seatIndex" = r."dealerSeat") AS is_last,
    (
      SELECT COALESCE(SUM(e3.bid), 0)::INTEGER
      FROM "RoundEntry" e3
      JOIN "Player" p3 ON p3.id = e3."playerId"
      JOIN unnest(r."bidOrderSeats") WITH ORDINALITY AS u(seat, idx) ON u.seat = p3."seatIndex"
      WHERE e3."roundId" = r.id
        AND e3.bid IS NOT NULL
        AND idx < (
          SELECT u2.idx
          FROM unnest(r."bidOrderSeats") WITH ORDINALITY AS u2(seat, idx)
          WHERE u2.seat = p."seatIndex"
          LIMIT 1
        )
    ) AS running_before
  FROM "RoundEntry" e2
  JOIN "Round" r ON r.id = e2."roundId"
  JOIN "Player" p ON p.id = e2."playerId"
) sub
WHERE e.id = sub.entry_id;

-- Backfill cumulative score / place after each completed round
WITH completed AS (
  SELECT
    r."gameId",
    r.number AS round_number,
    e."playerId",
    e.id AS entry_id,
    SUM(e2.points) FILTER (WHERE e2.points IS NOT NULL)::INTEGER AS cum
  FROM "Round" r
  JOIN "RoundEntry" e ON e."roundId" = r.id
  JOIN "Round" r2 ON r2."gameId" = r."gameId" AND r2.number <= r.number
  JOIN "RoundEntry" e2 ON e2."roundId" = r2.id AND e2."playerId" = e."playerId"
  WHERE r."completedAt" IS NOT NULL
  GROUP BY r."gameId", r.number, e."playerId", e.id
),
ranked AS (
  SELECT
    c.*,
    RANK() OVER (PARTITION BY c."gameId", c.round_number ORDER BY c.cum DESC)::INTEGER AS place,
    MAX(c.cum) OVER (PARTITION BY c."gameId", c.round_number) AS leader
  FROM completed c
)
UPDATE "RoundEntry" e
SET
  "cumulativeScore" = ranked.cum,
  "placeAfterRound" = ranked.place,
  "scoreBehindLeader" = ranked.leader - ranked.cum
FROM ranked
WHERE e.id = ranked.entry_id;

-- Backfill game winners for completed games
UPDATE "Game" g
SET
  "winnerPlayerId" = w.winner_id,
  "winnerScore" = w.winner_score,
  "runnerUpScore" = w.runner_up,
  "winMargin" = CASE
    WHEN w.runner_up IS NULL THEN NULL
    ELSE w.winner_score - w.runner_up
  END
FROM (
  SELECT
    g2.id AS game_id,
    (
      SELECT p.id
      FROM "Player" p
      JOIN LATERAL (
        SELECT COALESCE(SUM(e.points), 0)::INTEGER AS total
        FROM "RoundEntry" e
        JOIN "Round" r ON r.id = e."roundId"
        WHERE e."playerId" = p.id AND e.points IS NOT NULL
      ) t ON true
      WHERE p."gameId" = g2.id
      ORDER BY t.total DESC, p."seatIndex" ASC
      LIMIT 1
    ) AS winner_id,
    (
      SELECT t.total
      FROM "Player" p
      JOIN LATERAL (
        SELECT COALESCE(SUM(e.points), 0)::INTEGER AS total
        FROM "RoundEntry" e
        JOIN "Round" r ON r.id = e."roundId"
        WHERE e."playerId" = p.id AND e.points IS NOT NULL
      ) t ON true
      WHERE p."gameId" = g2.id
      ORDER BY t.total DESC, p."seatIndex" ASC
      LIMIT 1
    ) AS winner_score,
    (
      SELECT t.total
      FROM "Player" p
      JOIN LATERAL (
        SELECT COALESCE(SUM(e.points), 0)::INTEGER AS total
        FROM "RoundEntry" e
        JOIN "Round" r ON r.id = e."roundId"
        WHERE e."playerId" = p.id AND e.points IS NOT NULL
      ) t ON true
      WHERE p."gameId" = g2.id
      ORDER BY t.total DESC, p."seatIndex" ASC
      OFFSET 1
      LIMIT 1
    ) AS runner_up
  FROM "Game" g2
  WHERE g2.status = 'COMPLETED'
) w
WHERE g.id = w.game_id AND g.status = 'COMPLETED';
