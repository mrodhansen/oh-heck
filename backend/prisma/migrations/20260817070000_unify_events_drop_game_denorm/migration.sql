-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameEventType" ADD VALUE 'SESSION_CREATED';
ALTER TYPE "GameEventType" ADD VALUE 'SESSION_ENDED';
ALTER TYPE "GameEventType" ADD VALUE 'ROUND_SCORED';
ALTER TYPE "GameEventType" ADD VALUE 'GAME_COMPLETED';

-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "LiveEvent" DROP CONSTRAINT "LiveEvent_gameId_fkey";

-- DropForeignKey
ALTER TABLE "LiveEvent" DROP CONSTRAINT "LiveEvent_sessionId_fkey";

-- DropIndex
DROP INDEX "Game_liveCode_idx";

-- DropIndex
DROP INDEX "Game_tournamentId_idx";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "isHighTable",
DROP COLUMN "liveCode",
DROP COLUMN "tableNumber",
DROP COLUMN "tournamentId";

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "playerId" TEXT,
ADD COLUMN     "sessionId" TEXT,
ALTER COLUMN "gameId" DROP NOT NULL;

-- DropTable
DROP TABLE "LiveEvent";

-- CreateIndex
CREATE INDEX "GameEvent_sessionId_createdAt_idx" ON "GameEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "GameEvent_playerId_idx" ON "GameEvent"("playerId");

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
