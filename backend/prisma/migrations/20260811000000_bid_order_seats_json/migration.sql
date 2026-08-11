-- Portable bid order: INTEGER[] → JSONB (same shape as SQLite Json)
ALTER TABLE "Round" ALTER COLUMN "bidOrderSeats" DROP DEFAULT;
ALTER TABLE "Round"
  ALTER COLUMN "bidOrderSeats" TYPE JSONB
  USING COALESCE(to_jsonb("bidOrderSeats"), '[]'::jsonb);
ALTER TABLE "Round" ALTER COLUMN "bidOrderSeats" SET DEFAULT '[]'::jsonb;
