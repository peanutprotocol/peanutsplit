-- Private, consented support reports. There is deliberately no room-readable
-- API projection for this table; application support access is direct and
-- operationally controlled.
CREATE TABLE "split"."FeedbackReport" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "diagnostics" JSONB,
    "roomSnapshot" JSONB,
    "screenshot" BYTEA,
    "screenshotMimeType" TEXT,
    "screenshotByteLength" INTEGER,
    "screenshotWidth" INTEGER,
    "screenshotHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackReport_roomId_createdAt_idx"
ON "split"."FeedbackReport"("roomId", "createdAt");

CREATE INDEX "FeedbackReport_createdAt_idx"
ON "split"."FeedbackReport"("createdAt");

ALTER TABLE "split"."FeedbackReport"
ADD CONSTRAINT "FeedbackReport_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
