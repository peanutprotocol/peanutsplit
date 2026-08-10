-- WebKit copies cookies, but not localStorage, into a newly installed Home
-- Screen app. This short-lived row resolves one opaque copied cookie to one
-- room and (when proven at preparation time) one member viewpoint.
CREATE TABLE "split"."InstallHandoff" (
    "tokenHash" CHAR(64) NOT NULL,
    "roomId" TEXT NOT NULL,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallHandoff_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "InstallHandoff_expiresAt_idx" ON "split"."InstallHandoff"("expiresAt");

ALTER TABLE "split"."InstallHandoff"
ADD CONSTRAINT "InstallHandoff_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "split"."InstallHandoff"
ADD CONSTRAINT "InstallHandoff_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "split"."Member"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
