-- AlterTable
ALTER TABLE "split"."PushSubscription" ADD COLUMN     "transport" TEXT NOT NULL DEFAULT 'webpush',
ALTER COLUMN "p256dh" DROP NOT NULL,
ALTER COLUMN "auth" DROP NOT NULL;

