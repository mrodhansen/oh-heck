UPDATE "User"
SET
  "firstName" = 'Martin',
  "lastName" = 'Hansen'
WHERE "username" = 'martin'
  AND "firstName" IS NULL;

UPDATE "User"
SET
  "firstName" = 'Cope',
  "lastName" = 'Christiansen',
  "email" = 'copechristiansen@gmail.com'
WHERE "username" = 'copechristiansen@gmail.com'
  AND "firstName" IS NULL;

UPDATE "User"
SET
  "firstName" = 'Addie',
  "lastName" = 'Christiansen'
WHERE "username" = 'addie.christiansen'
  AND "firstName" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "firstName" IS NULL OR "lastName" IS NULL
  ) THEN
    RAISE EXCEPTION 'User rows missing firstName/lastName; refuse NOT NULL';
  END IF;
END $$;
