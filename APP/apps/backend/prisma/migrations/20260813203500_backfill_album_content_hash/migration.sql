INSERT INTO "AlbumMediaJob" (
  "id", "photoId", "kind", "status", "availableAt", "attempts", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::TEXT, photo."id", 'HASH_CONTENT', 'PENDING', CURRENT_TIMESTAMP,
       0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AlbumPhoto" photo
WHERE photo."sha256" IS NULL
ON CONFLICT ("photoId", "kind") DO NOTHING;
