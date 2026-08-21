-- The first abuse-state migration used PostgreSQL UUID for this Prisma String
-- field. Normalize it before later schema checks and preserve the original
-- migration checksum for deployments that already applied the first slice.
ALTER TABLE "FileShareUnlockAttempt"
ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
