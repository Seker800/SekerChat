-- DeleteData
-- SekerEagle upload sessions are isolated from SekerChat upload kinds and can be removed safely.
DELETE FROM "UploadSession" WHERE "kind" = 'EAGLE_ASSET';

-- DropCheckConstraints
-- Both constraints reference the retiring enum value or columns and must be replaced before the enum cast.
ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_eagle_duplicate_policy_check";
ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_target_check";

-- AlterEnum
BEGIN;
CREATE TYPE "UploadKind_new" AS ENUM ('CHAT_ATTACHMENT', 'ARTIFACT', 'SUBSCRIPTION_ATTACHMENT', 'ALBUM_PHOTO');
ALTER TABLE "UploadSession" ALTER COLUMN "kind" TYPE "UploadKind_new" USING ("kind"::text::"UploadKind_new");
ALTER TYPE "UploadKind" RENAME TO "UploadKind_old";
ALTER TYPE "UploadKind_new" RENAME TO "UploadKind";
DROP TYPE "public"."UploadKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "EagleAiAnalysisRun" DROP CONSTRAINT "EagleAiAnalysisRun_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAiTag" DROP CONSTRAINT "EagleAiTag_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAsset" DROP CONSTRAINT "EagleAsset_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAiTag" DROP CONSTRAINT "EagleAssetAiTag_ownerId_aiTagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAiTag" DROP CONSTRAINT "EagleAssetAiTag_ownerId_analysisRunId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAiTag" DROP CONSTRAINT "EagleAssetAiTag_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAiTag" DROP CONSTRAINT "EagleAssetAiTag_ownerId_promotedManualTagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAnnotation" DROP CONSTRAINT "EagleAssetAnnotation_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetAnnotation" DROP CONSTRAINT "EagleAssetAnnotation_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetColorAnalysis" DROP CONSTRAINT "EagleAssetColorAnalysis_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetColorSwatch" DROP CONSTRAINT "EagleAssetColorSwatch_ownerId_analysisId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetManualTag" DROP CONSTRAINT "EagleAssetManualTag_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetManualTag" DROP CONSTRAINT "EagleAssetManualTag_ownerId_tagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetManualTagIngestion" DROP CONSTRAINT "EagleAssetManualTagIngestion_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetManualTagIngestion" DROP CONSTRAINT "EagleAssetManualTagIngestion_ownerId_assetId_tagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleAssetRendition" DROP CONSTRAINT "EagleAssetRendition_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleExternalAsset" DROP CONSTRAINT "EagleExternalAsset_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleExternalAsset" DROP CONSTRAINT "EagleExternalAsset_ownerId_externalLibraryId_fkey";

-- DropForeignKey
ALTER TABLE "EagleExternalAsset" DROP CONSTRAINT "EagleExternalAsset_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleExternalLibrary" DROP CONSTRAINT "EagleExternalLibrary_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportFolderDefinition" DROP CONSTRAINT "EagleImportFolderDefinition_ownerId_runId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportManifestChunk" DROP CONSTRAINT "EagleImportManifestChunk_ownerId_runId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportRun" DROP CONSTRAINT "EagleImportRun_ownerId_externalLibraryId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportRun" DROP CONSTRAINT "EagleImportRun_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportRunItem" DROP CONSTRAINT "EagleImportRunItem_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportRunItem" DROP CONSTRAINT "EagleImportRunItem_ownerId_externalAssetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportRunItem" DROP CONSTRAINT "EagleImportRunItem_ownerId_runId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportTagDefinition" DROP CONSTRAINT "EagleImportTagDefinition_ownerId_runId_fkey";

-- DropForeignKey
ALTER TABLE "EagleImportTagGroupDefinition" DROP CONSTRAINT "EagleImportTagGroupDefinition_ownerId_runId_fkey";

-- DropForeignKey
ALTER TABLE "EagleManualTag" DROP CONSTRAINT "EagleManualTag_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleManualTag" DROP CONSTRAINT "EagleManualTag_ownerId_groupId_fkey";

-- DropForeignKey
ALTER TABLE "EagleManualTagGroup" DROP CONSTRAINT "EagleManualTagGroup_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleManualTagGroupMembership" DROP CONSTRAINT "EagleManualTagGroupMembership_ownerId_groupId_fkey";

-- DropForeignKey
ALTER TABLE "EagleManualTagGroupMembership" DROP CONSTRAINT "EagleManualTagGroupMembership_ownerId_tagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleMediaJob" DROP CONSTRAINT "EagleMediaJob_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolder" DROP CONSTRAINT "EagleSmartFolder_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolder" DROP CONSTRAINT "EagleSmartFolder_ownerId_parentId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolderAiTagDependency" DROP CONSTRAINT "EagleSmartFolderAiTagDependency_ownerId_aiTagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolderAiTagDependency" DROP CONSTRAINT "EagleSmartFolderAiTagDependency_ownerId_smartFolderId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolderManualTagDependency" DROP CONSTRAINT "EagleSmartFolderManualTagDependency_ownerId_manualTagId_fkey";

-- DropForeignKey
ALTER TABLE "EagleSmartFolderManualTagDependency" DROP CONSTRAINT "EagleSmartFolderManualTagDependency_ownerId_smartFolderId_fkey";

-- DropForeignKey
ALTER TABLE "EagleUploadSessionState" DROP CONSTRAINT "EagleUploadSessionState_ownerId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleUploadSessionState" DROP CONSTRAINT "EagleUploadSessionState_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EagleUploadSessionState" DROP CONSTRAINT "EagleUploadSessionState_ownerId_replacementAssetId_fkey";

-- DropForeignKey
ALTER TABLE "EagleUploadSessionState" DROP CONSTRAINT "EagleUploadSessionState_ownerId_uploadSessionId_fkey";

-- DropForeignKey
ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_uploaderId_eagleAssetId_fkey";

-- DropIndex
DROP INDEX "UploadSession_eagleAssetId_idx";

-- AlterTable
ALTER TABLE "UploadSession" DROP COLUMN "eagleAssetId",
DROP COLUMN "eagleDuplicatePolicy";

-- AddCheckConstraint
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_target_check" CHECK (
  ("kind" IN ('CHAT_ATTACHMENT', 'ARTIFACT') AND "groupId" IS NOT NULL AND "subscriptionAttachmentId" IS NULL AND "albumPhotoId" IS NULL)
  OR ("kind" = 'SUBSCRIPTION_ATTACHMENT' AND "groupId" IS NULL AND "subscriptionAttachmentId" IS NOT NULL AND "albumPhotoId" IS NULL)
  OR ("kind" = 'ALBUM_PHOTO' AND "groupId" IS NULL AND "subscriptionAttachmentId" IS NULL)
);

-- DropTable
DROP TABLE "EagleAiAnalysisRun";

-- DropTable
DROP TABLE "EagleAiTag";

-- DropTable
DROP TABLE "EagleAsset";

-- DropTable
DROP TABLE "EagleAssetAiTag";

-- DropTable
DROP TABLE "EagleAssetAnnotation";

-- DropTable
DROP TABLE "EagleAssetColorAnalysis";

-- DropTable
DROP TABLE "EagleAssetColorSwatch";

-- DropTable
DROP TABLE "EagleAssetManualTag";

-- DropTable
DROP TABLE "EagleAssetManualTagIngestion";

-- DropTable
DROP TABLE "EagleAssetRendition";

-- DropTable
DROP TABLE "EagleExternalAsset";

-- DropTable
DROP TABLE "EagleExternalLibrary";

-- DropTable
DROP TABLE "EagleImportFolderDefinition";

-- DropTable
DROP TABLE "EagleImportManifestChunk";

-- DropTable
DROP TABLE "EagleImportRun";

-- DropTable
DROP TABLE "EagleImportRunItem";

-- DropTable
DROP TABLE "EagleImportTagDefinition";

-- DropTable
DROP TABLE "EagleImportTagGroupDefinition";

-- DropTable
DROP TABLE "EagleManualTag";

-- DropTable
DROP TABLE "EagleManualTagGroup";

-- DropTable
DROP TABLE "EagleManualTagGroupMembership";

-- DropTable
DROP TABLE "EagleMediaJob";

-- DropTable
DROP TABLE "EagleProcessingWorkerHeartbeat";

-- DropTable
DROP TABLE "EagleSmartFolder";

-- DropTable
DROP TABLE "EagleSmartFolderAiTagDependency";

-- DropTable
DROP TABLE "EagleSmartFolderManualTagDependency";

-- DropTable
DROP TABLE "EagleUploadSessionState";

-- DropEnum
DROP TYPE "EagleAiAnalysisStatus";

-- DropEnum
DROP TYPE "EagleAiTagStatus";

-- DropEnum
DROP TYPE "EagleAssetLifecycleStatus";

-- DropEnum
DROP TYPE "EagleColorAnalysisStatus";

-- DropEnum
DROP TYPE "EagleExternalProvider";

-- DropEnum
DROP TYPE "EagleImportItemAction";

-- DropEnum
DROP TYPE "EagleImportItemStatus";

-- DropEnum
DROP TYPE "EagleImportRunStatus";

-- DropEnum
DROP TYPE "EagleMediaJobKind";

-- DropEnum
DROP TYPE "EagleMediaJobStatus";

-- DropEnum
DROP TYPE "EagleProcessingLane";

-- DropEnum
DROP TYPE "EagleRenditionKind";

-- DropEnum
DROP TYPE "EagleRenditionStatus";
