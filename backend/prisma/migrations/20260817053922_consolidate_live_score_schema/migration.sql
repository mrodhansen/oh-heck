/*
  Warnings:

  - You are about to drop the column `state` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `dealtHands` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `trickHistory` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `cardsPlayed` on the `RoundEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LiveSession" DROP COLUMN "state";

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "dealtHands",
DROP COLUMN "trickHistory";

-- AlterTable
ALTER TABLE "RoundEntry" DROP COLUMN "cardsPlayed";
