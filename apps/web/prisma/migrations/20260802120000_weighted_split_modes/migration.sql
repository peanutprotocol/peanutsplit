-- AddEnumValues
ALTER TYPE "split"."SplitMode" ADD VALUE 'PERCENTAGE';
ALTER TYPE "split"."SplitMode" ADD VALUE 'SHARES';

-- AlterTable
ALTER TABLE "split"."ExpenseShare" ADD COLUMN "splitWeight" BIGINT;
