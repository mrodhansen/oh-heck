-- Convert Game.notes from a single string to a JSON array of note objects.
ALTER TABLE "Game" ADD COLUMN "notes_list" JSONB NOT NULL DEFAULT '[]';

UPDATE "Game"
SET "notes_list" = CASE
  WHEN "notes" IS NULL OR btrim("notes") = '' THEN '[]'::jsonb
  ELSE jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'text', "notes",
      'createdAt', to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )
END;

ALTER TABLE "Game" DROP COLUMN "notes";
ALTER TABLE "Game" RENAME COLUMN "notes_list" TO "notes";
