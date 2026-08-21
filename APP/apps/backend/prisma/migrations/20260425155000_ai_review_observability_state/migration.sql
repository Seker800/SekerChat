-- AlterTable
ALTER TABLE "GroupAiReviewState"
ADD COLUMN     "lastErrorDetail" TEXT,
ADD COLUMN     "lastReadToolNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastReviewSummary" TEXT,
ADD COLUMN     "lastWriteActionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
