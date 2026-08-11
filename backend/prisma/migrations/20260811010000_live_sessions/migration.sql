-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('LOBBY', 'PLAYING', 'COMPLETED');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'LOBBY',
    "hostPlayerId" TEXT,
    "gameId" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivePlayer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_code_key" ON "LiveSession"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_gameId_key" ON "LiveSession"("gameId");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_createdAt_idx" ON "LiveSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_name_key" ON "LivePlayer"("sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_seatIndex_key" ON "LivePlayer"("sessionId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_token_key" ON "LivePlayer"("sessionId", "token");

-- CreateIndex
CREATE INDEX "LivePlayer_sessionId_idx" ON "LivePlayer"("sessionId");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePlayer" ADD CONSTRAINT "LivePlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
