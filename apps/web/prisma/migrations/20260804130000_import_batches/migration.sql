-- Provenance and idempotency for importing more than one source export into an
-- existing room. The source fingerprint is room-scoped: the same export is a
-- replay in one room, but may still be imported into a different room.
CREATE TABLE "split"."ImportBatch" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,
    "expenseCount" INTEGER NOT NULL,
    "addedMemberCount" INTEGER NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "split"."Expense"
ADD COLUMN "importBatchId" TEXT,
ADD COLUMN "importRowIndex" INTEGER;

-- An imported expense has complete provenance or none. The ordinal is also the
-- stable source-row identity inside a batch; ordinary expenses keep both null.
ALTER TABLE "split"."Expense"
ADD CONSTRAINT "Expense_import_provenance_check"
CHECK (
    ("importBatchId" IS NULL AND "importRowIndex" IS NULL)
    OR
    ("importBatchId" IS NOT NULL AND "importRowIndex" IS NOT NULL AND "importRowIndex" >= 0)
);

CREATE UNIQUE INDEX "ImportBatch_roomId_fingerprint_key"
ON "split"."ImportBatch"("roomId", "fingerprint");

CREATE INDEX "ImportBatch_roomId_importedAt_idx"
ON "split"."ImportBatch"("roomId", "importedAt");

CREATE UNIQUE INDEX "Expense_importBatchId_importRowIndex_key"
ON "split"."Expense"("importBatchId", "importRowIndex");

ALTER TABLE "split"."ImportBatch"
ADD CONSTRAINT "ImportBatch_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "split"."Expense"
ADD CONSTRAINT "Expense_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "split"."ImportBatch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
