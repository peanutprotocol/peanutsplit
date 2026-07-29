-- Remove the email-specific account fields added for the retired magic-link flow.
-- Keep User, AuthAccount, and Member.userId as the original dormant claim hooks.
DROP INDEX "split"."User_email_key";

ALTER TABLE "split"."User"
DROP COLUMN "email",
DROP COLUMN "emailVerifiedAt",
DROP COLUMN "lastSeenAt",
DROP COLUMN "tokenEpoch";
