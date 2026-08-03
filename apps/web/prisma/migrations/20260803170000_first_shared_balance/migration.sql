-- A room crosses onboarding only once. This is intentionally a scalar marker,
-- not a foreign key: deleting the triggering expense must not reset the room.
ALTER TABLE "split"."Room"
ADD COLUMN "firstSharedBalanceExpenseId" TEXT;

-- Existing rooms are already mature when any historical expense (including a
-- soft-deleted one) assigned a positive share to somebody other than its payer.
WITH "firstSharedBalance" AS (
    SELECT DISTINCT ON (expense."roomId")
        expense."roomId",
        expense."id"
    FROM "split"."Expense" AS expense
    INNER JOIN "split"."ExpenseShare" AS share
        ON share."expenseId" = expense."id"
    WHERE share."memberId" <> expense."paidById"
      AND share."amountMinor" > 0
    ORDER BY expense."roomId", expense."createdAt" ASC, expense."id" ASC
)
UPDATE "split"."Room" AS room
SET "firstSharedBalanceExpenseId" = first."id"
FROM "firstSharedBalance" AS first
WHERE room."id" = first."roomId";
