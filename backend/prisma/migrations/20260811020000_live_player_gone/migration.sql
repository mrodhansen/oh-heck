-- AlterTable
ALTER TABLE "LivePlayer" ADD COLUMN "gone" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "LivePlayer_sessionId_gone_idx" ON "LivePlayer"("sessionId", "gone");
