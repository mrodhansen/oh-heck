-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('OPEN', 'SEATED', 'IN_PROGRESS', 'HIGH_TABLE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('PRELIM', 'HIGH_TABLE');

-- CreateEnum
CREATE TYPE "TournamentTableStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable Game
ALTER TABLE "Game" ADD COLUMN "tournamentTableId" TEXT;
ALTER TABLE "Game" ADD COLUMN "isHighTable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "tableNumber" INTEGER;
ALTER TABLE "Game" ADD COLUMN "tournamentId" TEXT;

-- AlterTable Player
ALTER TABLE "Player" ADD COLUMN "tournamentPlayerId" TEXT;

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'OPEN',
    "targetPlayerCount" INTEGER NOT NULL,
    "preferredTableSize" INTEGER NOT NULL DEFAULT 7,
    "minTableSize" INTEGER NOT NULL DEFAULT 2,
    "maxTableSize" INTEGER NOT NULL DEFAULT 7,
    "highTableSize" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "highTableAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTable" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "stage" "TournamentStage" NOT NULL DEFAULT 'PRELIM',
    "isHighTable" BOOLEAN NOT NULL DEFAULT false,
    "status" "TournamentTableStatus" NOT NULL DEFAULT 'PENDING',
    "dealerSeat" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTableSeat" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tournamentPlayerId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "sourceTableId" TEXT,
    "sourceTableNumber" INTEGER,
    "sourcePlace" INTEGER,
    "sourceScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTableSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_tournamentTableId_key" ON "Game"("tournamentTableId");

-- CreateIndex
CREATE INDEX "Game_tournamentId_idx" ON "Game"("tournamentId");

-- CreateIndex
CREATE INDEX "Player_tournamentPlayerId_idx" ON "Player"("tournamentPlayerId");

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_idx" ON "TournamentPlayer"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_name_key" ON "TournamentPlayer"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "TournamentTable_tournamentId_idx" ON "TournamentTable"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTable_tournamentId_tableNumber_stage_key" ON "TournamentTable"("tournamentId", "tableNumber", "stage");

-- CreateIndex
CREATE INDEX "TournamentTableSeat_tournamentPlayerId_idx" ON "TournamentTableSeat"("tournamentPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTableSeat_tableId_seatIndex_key" ON "TournamentTableSeat"("tableId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTableSeat_tableId_tournamentPlayerId_key" ON "TournamentTableSeat"("tableId", "tournamentPlayerId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentTableId_fkey" FOREIGN KEY ("tournamentTableId") REFERENCES "TournamentTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTable" ADD CONSTRAINT "TournamentTable_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TournamentTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
