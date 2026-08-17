INSERT INTO "GamePlayer" ("id", "gameId", "playerId", "seatIndex", "token", "isHost", "gone")
SELECT gen_random_uuid()::text, p."gameId", p."id", p."seatIndex", NULL, false, false
FROM "Player" p
WHERE p."gameId" IS NOT NULL AND p."seatIndex" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "GamePlayer" gp
    WHERE gp."gameId" = p."gameId" AND gp."playerId" = p."id"
  );

UPDATE "LiveSession" s
SET "lobby" = COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', lp."id",
      'name', lp."name",
      'token', lp."token",
      'seatIndex', lp."seatIndex",
      'isHost', lp."isHost",
      'gone', lp."gone",
      'userId', lp."userId"
    )
    ORDER BY lp."seatIndex"
  )
  FROM "LivePlayer" lp
  WHERE lp."sessionId" = s.id
), '[]'::jsonb)
WHERE s."status" = 'LOBBY';

UPDATE "GamePlayer" gp
SET
  "token" = lp."token",
  "isHost" = lp."isHost",
  "gone" = lp."gone"
FROM "LivePlayer" lp
JOIN "LiveSession" s ON s."id" = lp."sessionId"
WHERE s."gameId" = gp."gameId"
  AND gp."playerId" = lp."id";

INSERT INTO "Player" ("id", "name", "createdAt")
SELECT tp."id", tp."name", tp."createdAt"
FROM "TournamentPlayer" tp
WHERE NOT EXISTS (SELECT 1 FROM "Player" p WHERE p."id" = tp."id");

INSERT INTO "TournamentRoster" ("id", "tournamentId", "playerId", "orderIndex", "createdAt")
SELECT gen_random_uuid()::text, tp."tournamentId", tp."id", tp."orderIndex", tp."createdAt"
FROM "TournamentPlayer" tp
WHERE NOT EXISTS (
  SELECT 1 FROM "TournamentRoster" r
  WHERE r."tournamentId" = tp."tournamentId" AND r."playerId" = tp."id"
);

UPDATE "TournamentTableSeat" SET "playerId" = "tournamentPlayerId"
WHERE "playerId" IS NULL;

UPDATE "GamePlayer" gp
SET "playerId" = p."tournamentPlayerId"
FROM "Player" p
WHERE gp."playerId" = p."id"
  AND p."tournamentPlayerId" IS NOT NULL
  AND p."id" <> p."tournamentPlayerId";

UPDATE "RoundEntry" re
SET "playerId" = p."tournamentPlayerId"
FROM "Player" p
WHERE re."playerId" = p."id"
  AND p."tournamentPlayerId" IS NOT NULL
  AND p."id" <> p."tournamentPlayerId";

UPDATE "TrickPlay" tp
SET "playerId" = p."tournamentPlayerId"
FROM "Player" p
WHERE tp."playerId" = p."id"
  AND p."tournamentPlayerId" IS NOT NULL
  AND p."id" <> p."tournamentPlayerId";

UPDATE "Trick" t
SET "winnerPlayerId" = p."tournamentPlayerId"
FROM "Player" p
WHERE t."winnerPlayerId" = p."id"
  AND p."tournamentPlayerId" IS NOT NULL
  AND p."id" <> p."tournamentPlayerId";

WITH ranked AS (
  SELECT
    p."id",
    p."userId",
    ROW_NUMBER() OVER (PARTITION BY p."userId" ORDER BY p."createdAt", p."id") AS rn
  FROM "Player" p
  WHERE p."userId" IS NOT NULL
),
dupes AS (
  SELECT r."id" AS dupe_id, c."id" AS keep_id
  FROM ranked r
  JOIN ranked c ON c."userId" = r."userId" AND c.rn = 1
  WHERE r.rn > 1
)
UPDATE "GamePlayer" gp
SET "playerId" = d.keep_id
FROM dupes d
WHERE gp."playerId" = d.dupe_id;

WITH ranked AS (
  SELECT
    p."id",
    p."userId",
    ROW_NUMBER() OVER (PARTITION BY p."userId" ORDER BY p."createdAt", p."id") AS rn
  FROM "Player" p
  WHERE p."userId" IS NOT NULL
),
dupes AS (
  SELECT r."id" AS dupe_id, c."id" AS keep_id
  FROM ranked r
  JOIN ranked c ON c."userId" = r."userId" AND c.rn = 1
  WHERE r.rn > 1
)
UPDATE "RoundEntry" re
SET "playerId" = d.keep_id
FROM dupes d
WHERE re."playerId" = d.dupe_id;

WITH ranked AS (
  SELECT
    p."id",
    p."userId",
    ROW_NUMBER() OVER (PARTITION BY p."userId" ORDER BY p."createdAt", p."id") AS rn
  FROM "Player" p
  WHERE p."userId" IS NOT NULL
),
dupes AS (
  SELECT r."id" AS dupe_id, c."id" AS keep_id
  FROM ranked r
  JOIN ranked c ON c."userId" = r."userId" AND c.rn = 1
  WHERE r.rn > 1
)
UPDATE "TrickPlay" tp
SET "playerId" = d.keep_id
FROM dupes d
WHERE tp."playerId" = d.dupe_id;

WITH ranked AS (
  SELECT
    p."id",
    p."userId",
    ROW_NUMBER() OVER (PARTITION BY p."userId" ORDER BY p."createdAt", p."id") AS rn
  FROM "Player" p
  WHERE p."userId" IS NOT NULL
),
dupes AS (
  SELECT r."id" AS dupe_id, c."id" AS keep_id
  FROM ranked r
  JOIN ranked c ON c."userId" = r."userId" AND c.rn = 1
  WHERE r.rn > 1
)
UPDATE "Trick" t
SET "winnerPlayerId" = d.keep_id
FROM dupes d
WHERE t."winnerPlayerId" = d.dupe_id;

DELETE FROM "Player" p
WHERE p."tournamentPlayerId" IS NOT NULL
  AND p."id" <> p."tournamentPlayerId"
  AND NOT EXISTS (SELECT 1 FROM "GamePlayer" gp WHERE gp."playerId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "RoundEntry" re WHERE re."playerId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "TournamentRoster" r WHERE r."playerId" = p."id");

DELETE FROM "Player" p
WHERE p."userId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Player" keep
    WHERE keep."userId" = p."userId"
      AND keep."createdAt" < p."createdAt"
  )
  AND NOT EXISTS (SELECT 1 FROM "GamePlayer" gp WHERE gp."playerId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "RoundEntry" re WHERE re."playerId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "TournamentRoster" r WHERE r."playerId" = p."id");
