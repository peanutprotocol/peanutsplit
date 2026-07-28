-- CreateTable
CREATE TABLE "split"."PushSubscription" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split"."NotificationSend" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "dismissedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushSubscription_roomId_idx" ON "split"."PushSubscription"("roomId");

-- CreateIndex
CREATE INDEX "PushSubscription_memberId_idx" ON "split"."PushSubscription"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_roomId_key" ON "split"."PushSubscription"("endpoint", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSend_dedupeKey_key" ON "split"."NotificationSend"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationSend_roomId_template_dayKey_idx" ON "split"."NotificationSend"("roomId", "template", "dayKey");

-- AddForeignKey
ALTER TABLE "split"."PushSubscription" ADD CONSTRAINT "PushSubscription_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split"."PushSubscription" ADD CONSTRAINT "PushSubscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "split"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split"."NotificationSend" ADD CONSTRAINT "NotificationSend_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
