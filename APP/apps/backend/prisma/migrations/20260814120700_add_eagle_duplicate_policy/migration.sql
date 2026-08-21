ALTER TABLE "UploadSession"
ADD COLUMN "eagleDuplicatePolicy" TEXT;

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_eagle_duplicate_policy_check"
CHECK (
  ("kind" = 'EAGLE_ASSET' AND "eagleDuplicatePolicy" IN ('SKIP', 'IMPORT'))
  OR ("kind" <> 'EAGLE_ASSET' AND "eagleDuplicatePolicy" IS NULL)
);
