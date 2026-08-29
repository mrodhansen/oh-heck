-- AlterTable
ALTER TABLE "Game" ADD COLUMN "isHighTable" BOOLEAN NOT NULL DEFAULT false;

-- Copy from live tournament tables
UPDATE "Game" AS g
SET "isHighTable" = true
FROM "TournamentTable" AS t
WHERE g."tournamentTableId" = t.id
  AND t."isHighTable" = true;

-- Hawaii 2026 reunion high tables (seeded before this column)
UPDATE "Game"
SET "isHighTable" = true
WHERE name IN (
  'Game 4 · Jun 23, 2026',
  'Game 9 · Jun 23, 2026',
  'Game 14 · Jun 25, 2026'
);
