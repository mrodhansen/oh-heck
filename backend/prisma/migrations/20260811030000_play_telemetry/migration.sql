-- CreateEnum
CREATE TYPE "PlayMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- AlterEnum
ALTER TYPE "GameEventType" ADD VALUE 'ROUND_DEALT';
ALTER TYPE "GameEventType" ADD VALUE 'CARD_PLAYED';
ALTER TYPE "GameEventType" ADD VALUE 'TRICK_COMPLETED';
ALTER TYPE "GameEventType" ADD VALUE 'BID_PLACED';
ALTER TYPE "GameEventType" ADD VALUE 'PLAYER_LEFT';
ALTER TYPE "GameEventType" ADD VALUE 'SEAT_CLAIMED';
ALTER TYPE "GameEventType" ADD VALUE 'PLAYER_JOINED';
ALTER TYPE "GameEventType" ADD VALUE 'GAME_STARTED_LIVE';

-- AlterTable Game
ALTER TABLE "Game" ADD COLUMN "playMode" "PlayMode" NOT NULL DEFAULT 'IN_PERSON';
ALTER TABLE "Game" ADD COLUMN "liveCode" TEXT;

-- AlterTable Round
ALTER TABLE "Round" ADD COLUMN "trumpSuit" TEXT;
ALTER TABLE "Round" ADD COLUMN "trumpCard" JSONB;
ALTER TABLE "Round" ADD COLUMN "dealtHands" JSONB;
ALTER TABLE "Round" ADD COLUMN "dealtAt" TIMESTAMP(3);
ALTER TABLE "Round" ADD COLUMN "trickHistory" JSONB;

-- AlterTable RoundEntry
ALTER TABLE "RoundEntry" ADD COLUMN "bidPlacedAt" TIMESTAMP(3);
ALTER TABLE "RoundEntry" ADD COLUMN "dealtHand" JSONB;
ALTER TABLE "RoundEntry" ADD COLUMN "cardsPlayed" JSONB;

-- CreateTable Trick
CREATE TABLE "Trick" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "trickIndex" INTEGER NOT NULL,
    "leadSeat" INTEGER NOT NULL,
    "leadSuit" TEXT NOT NULL,
    "winnerSeat" INTEGER NOT NULL,
    "winnerPlayerId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trick_pkey" PRIMARY KEY ("id")
);

-- CreateTable TrickPlay
CREATE TABLE "TrickPlay" (
    "id" TEXT NOT NULL,
    "trickId" TEXT NOT NULL,
    "playOrder" INTEGER NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "cardSuit" TEXT NOT NULL,
    "cardRank" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "followedSuit" BOOLEAN NOT NULL DEFAULT true,
    "playedTrump" BOOLEAN NOT NULL DEFAULT false,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrickPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable LiveEvent
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "gameId" TEXT,
    "type" TEXT NOT NULL,
    "playerId" TEXT,
    "roundNumber" INTEGER,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_playMode_idx" ON "Game"("playMode");
CREATE INDEX "Game_liveCode_idx" ON "Game"("liveCode");

CREATE UNIQUE INDEX "Trick_roundId_trickIndex_key" ON "Trick"("roundId", "trickIndex");
CREATE INDEX "Trick_gameId_idx" ON "Trick"("gameId");
CREATE INDEX "Trick_roundId_idx" ON "Trick"("roundId");
CREATE INDEX "Trick_winnerPlayerId_idx" ON "Trick"("winnerPlayerId");

CREATE UNIQUE INDEX "TrickPlay_trickId_playOrder_key" ON "TrickPlay"("trickId", "playOrder");
CREATE UNIQUE INDEX "TrickPlay_trickId_seatIndex_key" ON "TrickPlay"("trickId", "seatIndex");
CREATE INDEX "TrickPlay_playerId_idx" ON "TrickPlay"("playerId");
CREATE INDEX "TrickPlay_cardKey_idx" ON "TrickPlay"("cardKey");

CREATE INDEX "LiveEvent_sessionId_createdAt_idx" ON "LiveEvent"("sessionId", "createdAt");
CREATE INDEX "LiveEvent_gameId_createdAt_idx" ON "LiveEvent"("gameId", "createdAt");
CREATE INDEX "LiveEvent_type_idx" ON "LiveEvent"("type");
CREATE INDEX "LiveEvent_playerId_idx" ON "LiveEvent"("playerId");

-- AddForeignKey
ALTER TABLE "Trick" ADD CONSTRAINT "Trick_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trick" ADD CONSTRAINT "Trick_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrickPlay" ADD CONSTRAINT "TrickPlay_trickId_fkey" FOREIGN KEY ("trickId") REFERENCES "Trick"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
