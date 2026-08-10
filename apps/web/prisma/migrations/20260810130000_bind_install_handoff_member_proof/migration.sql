-- Bind a prepared member viewpoint to the exact proof version that armed it.
-- Member restore rotates that proof; an older handoff must then restore only
-- the room instead of silently acquiring the new capability.
ALTER TABLE "split"."InstallHandoff"
ADD COLUMN "memberTokenHash" CHAR(64);

-- Preparation serializes and counts outstanding intents per room.
CREATE INDEX "InstallHandoff_roomId_idx" ON "split"."InstallHandoff"("roomId");
