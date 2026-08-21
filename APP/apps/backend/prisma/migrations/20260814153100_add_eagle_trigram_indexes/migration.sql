CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "EagleAsset_normalizedDisplayName_trgm_idx"
ON "EagleAsset" USING GIN ("normalizedDisplayName" gin_trgm_ops);

CREATE INDEX "EagleAsset_originalName_trgm_idx"
ON "EagleAsset" USING GIN ("originalName" gin_trgm_ops);

CREATE INDEX "EagleManualTag_normalizedName_trgm_idx"
ON "EagleManualTag" USING GIN ("normalizedName" gin_trgm_ops);

CREATE INDEX "EagleAiTag_normalizedName_trgm_idx"
ON "EagleAiTag" USING GIN ("normalizedName" gin_trgm_ops);
