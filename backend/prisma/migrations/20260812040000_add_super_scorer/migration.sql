-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "superScorer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "currentTrick" JSONB;
