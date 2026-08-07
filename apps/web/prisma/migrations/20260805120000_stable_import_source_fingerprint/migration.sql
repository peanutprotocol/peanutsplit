-- Keep the original semantic fingerprint for clients and batches that predate
-- immutable upload identity. New clients additionally send a SHA-256 source
-- fingerprint, which remains stable across parser improvements and UI renames.
ALTER TABLE "split"."ImportBatch"
ADD COLUMN "sourceFingerprint" TEXT;

CREATE UNIQUE INDEX "ImportBatch_roomId_sourceFingerprint_key"
ON "split"."ImportBatch"("roomId", "sourceFingerprint");
