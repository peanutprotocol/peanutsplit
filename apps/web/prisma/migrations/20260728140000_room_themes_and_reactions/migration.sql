-- AlterTable
ALTER TABLE "split"."Room" ADD COLUMN     "theme" TEXT;

-- CreateTable
CREATE TABLE "split"."ExpenseReaction" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseReaction_expenseId_idx" ON "split"."ExpenseReaction"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseReaction_expenseId_memberId_emoji_key" ON "split"."ExpenseReaction"("expenseId", "memberId", "emoji");

-- AddForeignKey
ALTER TABLE "split"."ExpenseReaction" ADD CONSTRAINT "ExpenseReaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "split"."Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split"."ExpenseReaction" ADD CONSTRAINT "ExpenseReaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "split"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

