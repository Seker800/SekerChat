-- Category ordering is derived from channel activity. The legacy sortOrder
-- column is no longer part of the application model and prevents inserts on
-- databases created before that model change.
ALTER TABLE "Category" DROP COLUMN IF EXISTS "sortOrder";
