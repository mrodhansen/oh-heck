-- DropIndex
DROP INDEX "Player_gameId_name_key";

-- DropIndex
DROP INDEX "Player_gameId_seatIndex_key";

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "lobby" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "gameId" DROP NOT NULL,
ALTER COLUMN "seatIndex" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TournamentTableSeat" ADD COLUMN     "playerId" TEXT;

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "token" TEXT,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "gone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRoster" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentRoster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_token_key" ON "GamePlayer"("token");

-- CreateIndex
CREATE INDEX "GamePlayer_playerId_idx" ON "GamePlayer"("playerId");

-- CreateIndex
CREATE INDEX "GamePlayer_gameId_gone_idx" ON "GamePlayer"("gameId", "gone");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_seatIndex_key" ON "GamePlayer"("gameId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_playerId_key" ON "GamePlayer"("gameId", "playerId");

-- CreateIndex
CREATE INDEX "TournamentRoster_tournamentId_idx" ON "TournamentRoster"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRoster_tournamentId_playerId_key" ON "TournamentRoster"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "Player_name_idx" ON "Player"("name");

-- CreateIndex
CREATE INDEX "TournamentTableSeat_playerId_idx" ON "TournamentTableSeat"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTableSeat_tableId_playerId_key" ON "TournamentTableSeat"("tableId", "playerId");

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRoster" ADD CONSTRAINT "TournamentRoster_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRoster" ADD CONSTRAINT "TournamentRoster_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
