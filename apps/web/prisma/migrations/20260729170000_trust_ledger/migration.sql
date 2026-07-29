-- Existing members have already been exposed as claimable identities, so they
-- are protected by default. Only future on-behalf roster additions are marked
-- provisional by application code.
ALTER TABLE "split"."Member"
ADD COLUMN "provisional" BOOLEAN NOT NULL DEFAULT false;

-- A receipt link is user-supplied documentation. The service stores the text
-- and never requests it.
ALTER TABLE "split"."Settlement"
ADD COLUMN "receiptUrl" TEXT;
