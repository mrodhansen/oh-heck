-- DropForeignKey
ALTER TABLE "LivePlayer" DROP CONSTRAINT "LivePlayer_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "LivePlayer" DROP CONSTRAINT "LivePlayer_userId_fkey";

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_tournamentPlayerId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentPlayer" DROP CONSTRAINT "TournamentPlayer_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentTableSeat" DROP CONSTRAINT "TournamentTableSeat_playerId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentTableSeat" DROP CONSTRAINT "TournamentTableSeat_tournamentPlayerId_fkey";

-- DropIndex
DROP INDEX "Player_gameId_idx";

-- DropIndex
DROP INDEX "Player_tournamentPlayerId_idx";

-- DropIndex
DROP INDEX "Player_userId_idx";

-- DropIndex
DROP INDEX "TournamentTableSeat_tableId_tournamentPlayerId_key";

-- DropIndex
DROP INDEX "TournamentTableSeat_tournamentPlayerId_idx";

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "gameId",
DROP COLUMN "seatIndex",
DROP COLUMN "tournamentPlayerId";

-- AlterTable
ALTER TABLE "TournamentTableSeat" DROP COLUMN "tournamentPlayerId",
ALTER COLUMN "playerId" SET NOT NULL;

-- DropTable
DROP TABLE "LivePlayer";

-- DropTable
DROP TABLE "TournamentPlayer";

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
