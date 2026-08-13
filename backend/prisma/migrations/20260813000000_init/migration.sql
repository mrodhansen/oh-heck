-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('SETUP', 'BIDDING', 'PLAYING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PlayMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('OPEN', 'SEATED', 'IN_PROGRESS', 'HIGH_TABLE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('PRELIM', 'HIGH_TABLE');

-- CreateEnum
CREATE TYPE "TournamentTableStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('GAME_CREATED', 'BIDS_SET', 'TRICKS_SET', 'ROUND_UPDATED', 'ROUND_DEALT', 'CARD_PLAYED', 'TRICK_COMPLETED', 'BID_PLACED', 'PLAYER_LEFT', 'SEAT_CLAIMED', 'PLAYER_JOINED', 'GAME_STARTED_LIVE');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('LOBBY', 'PLAYING', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "status" "GameStatus" NOT NULL DEFAULT 'BIDDING',
    "playMode" "PlayMode" NOT NULL DEFAULT 'IN_PERSON',
    "liveCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "firstDealerSeat" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "superScorer" BOOLEAN NOT NULL DEFAULT false,
    "tournamentTableId" TEXT,
    "isHighTable" BOOLEAN NOT NULL DEFAULT false,
    "tableNumber" INTEGER,
    "tournamentId" TEXT,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "tournamentPlayerId" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "handSize" INTEGER NOT NULL,
    "dealerSeat" INTEGER NOT NULL,
    "forceBurn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstBidderSeat" INTEGER NOT NULL DEFAULT 0,
    "dealerPlayerId" TEXT,
    "firstBidderPlayerId" TEXT,
    "bidOrderSeats" JSONB NOT NULL DEFAULT '[]',
    "bidsCompletedAt" TIMESTAMP(3),
    "tricksCompletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "trumpSuit" TEXT,
    "trumpCard" JSONB,
    "dealtHands" JSONB,
    "dealtAt" TIMESTAMP(3),
    "trickHistory" JSONB,
    "currentTrick" JSONB,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundEntry" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bid" INTEGER,
    "tricksTaken" INTEGER,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bidPosition" INTEGER,
    "isDealer" BOOLEAN NOT NULL DEFAULT false,
    "isFirstBidder" BOOLEAN NOT NULL DEFAULT false,
    "isLastBidder" BOOLEAN NOT NULL DEFAULT false,
    "runningBidBefore" INTEGER,
    "bidPlacedAt" TIMESTAMP(3),
    "dealtHand" JSONB,
    "cardsPlayed" JSONB,

    CONSTRAINT "RoundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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
    "gone" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_tournamentTableId_key" ON "Game"("tournamentTableId");

-- CreateIndex
CREATE INDEX "Game_tournamentId_idx" ON "Game"("tournamentId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "Game_finishedAt_idx" ON "Game"("finishedAt");

-- CreateIndex
CREATE INDEX "Game_playMode_idx" ON "Game"("playMode");

-- CreateIndex
CREATE INDEX "Game_liveCode_idx" ON "Game"("liveCode");

-- CreateIndex
CREATE INDEX "Player_gameId_idx" ON "Player"("gameId");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Player_tournamentPlayerId_idx" ON "Player"("tournamentPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_seatIndex_key" ON "Player"("gameId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_name_key" ON "Player"("gameId", "name");

-- CreateIndex
CREATE INDEX "Round_gameId_idx" ON "Round"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_gameId_number_key" ON "Round"("gameId", "number");

-- CreateIndex
CREATE INDEX "RoundEntry_playerId_idx" ON "RoundEntry"("playerId");

-- CreateIndex
CREATE INDEX "RoundEntry_isDealer_idx" ON "RoundEntry"("isDealer");

-- CreateIndex
CREATE INDEX "RoundEntry_bidPosition_idx" ON "RoundEntry"("bidPosition");

-- CreateIndex
CREATE UNIQUE INDEX "RoundEntry_roundId_playerId_key" ON "RoundEntry"("roundId", "playerId");

-- CreateIndex
CREATE INDEX "Trick_gameId_idx" ON "Trick"("gameId");

-- CreateIndex
CREATE INDEX "Trick_roundId_idx" ON "Trick"("roundId");

-- CreateIndex
CREATE INDEX "Trick_winnerPlayerId_idx" ON "Trick"("winnerPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Trick_roundId_trickIndex_key" ON "Trick"("roundId", "trickIndex");

-- CreateIndex
CREATE INDEX "TrickPlay_playerId_idx" ON "TrickPlay"("playerId");

-- CreateIndex
CREATE INDEX "TrickPlay_cardKey_idx" ON "TrickPlay"("cardKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrickPlay_trickId_playOrder_key" ON "TrickPlay"("trickId", "playOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrickPlay_trickId_seatIndex_key" ON "TrickPlay"("trickId", "seatIndex");

-- CreateIndex
CREATE INDEX "LiveEvent_sessionId_createdAt_idx" ON "LiveEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveEvent_gameId_createdAt_idx" ON "LiveEvent"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveEvent_type_idx" ON "LiveEvent"("type");

-- CreateIndex
CREATE INDEX "LiveEvent_playerId_idx" ON "LiveEvent"("playerId");

-- CreateIndex
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameEvent_gameId_type_idx" ON "GameEvent"("gameId", "type");

-- CreateIndex
CREATE INDEX "GameEvent_type_idx" ON "GameEvent"("type");

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

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_code_key" ON "LiveSession"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_gameId_key" ON "LiveSession"("gameId");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_createdAt_idx" ON "LiveSession"("createdAt");

-- CreateIndex
CREATE INDEX "LivePlayer_sessionId_idx" ON "LivePlayer"("sessionId");

-- CreateIndex
CREATE INDEX "LivePlayer_sessionId_gone_idx" ON "LivePlayer"("sessionId", "gone");

-- CreateIndex
CREATE INDEX "LivePlayer_userId_idx" ON "LivePlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_name_key" ON "LivePlayer"("sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_seatIndex_key" ON "LivePlayer"("sessionId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LivePlayer_sessionId_token_key" ON "LivePlayer"("sessionId", "token");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentTableId_fkey" FOREIGN KEY ("tournamentTableId") REFERENCES "TournamentTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundEntry" ADD CONSTRAINT "RoundEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundEntry" ADD CONSTRAINT "RoundEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trick" ADD CONSTRAINT "Trick_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trick" ADD CONSTRAINT "Trick_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrickPlay" ADD CONSTRAINT "TrickPlay_trickId_fkey" FOREIGN KEY ("trickId") REFERENCES "Trick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTable" ADD CONSTRAINT "TournamentTable_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TournamentTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTableSeat" ADD CONSTRAINT "TournamentTableSeat_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePlayer" ADD CONSTRAINT "LivePlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePlayer" ADD CONSTRAINT "LivePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
