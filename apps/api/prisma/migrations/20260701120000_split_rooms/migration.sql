-- CreateEnum
CREATE TYPE "app"."SplitKind" AS ENUM ('EQUAL', 'EXACT');

-- CreateEnum
CREATE TYPE "app"."SplitSettlementMethod" AS ENUM ('MANUAL', 'PEANUT');

-- CreateTable
CREATE TABLE "app"."split_rooms" (
    "split_room_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(32) NOT NULL,
    "title" VARCHAR(255),
    "base_currency" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "split_rooms_pkey" PRIMARY KEY ("split_room_id")
);

-- CreateTable
CREATE TABLE "app"."split_members" (
    "split_member_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "color_seed" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "split_members_pkey" PRIMARY KEY ("split_member_id")
);

-- CreateTable
CREATE TABLE "app"."split_expenses" (
    "split_expense_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "base_amount_minor" BIGINT NOT NULL,
    "fx_rate" DECIMAL(28,18) NOT NULL,
    "fx_source" VARCHAR(32) NOT NULL,
    "split_kind" "app"."SplitKind" NOT NULL,
    "paid_by_member_id" UUID NOT NULL,
    "created_by_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "split_expenses_pkey" PRIMARY KEY ("split_expense_id")
);

-- CreateTable
CREATE TABLE "app"."split_shares" (
    "split_share_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expense_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "split_shares_pkey" PRIMARY KEY ("split_share_id")
);

-- CreateTable
CREATE TABLE "app"."split_settlements" (
    "split_settlement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "from_member_id" UUID NOT NULL,
    "to_member_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "method" "app"."SplitSettlementMethod" NOT NULL DEFAULT 'MANUAL',
    "peanut_ref" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "split_settlements_pkey" PRIMARY KEY ("split_settlement_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "split_rooms_slug_key" ON "app"."split_rooms"("slug");

-- CreateIndex
CREATE INDEX "idx_split_member_room" ON "app"."split_members"("room_id");

-- CreateIndex
CREATE INDEX "idx_split_expense_room" ON "app"."split_expenses"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_split_share_expense_member" ON "app"."split_shares"("expense_id", "member_id");

-- CreateIndex
CREATE INDEX "idx_split_settlement_room" ON "app"."split_settlements"("room_id");

-- AddForeignKey
ALTER TABLE "app"."split_members" ADD CONSTRAINT "split_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "app"."split_rooms"("split_room_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_expenses" ADD CONSTRAINT "split_expenses_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "app"."split_rooms"("split_room_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_expenses" ADD CONSTRAINT "split_expenses_paid_by_member_id_fkey" FOREIGN KEY ("paid_by_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_expenses" ADD CONSTRAINT "split_expenses_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_shares" ADD CONSTRAINT "split_shares_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "app"."split_expenses"("split_expense_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_shares" ADD CONSTRAINT "split_shares_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_settlements" ADD CONSTRAINT "split_settlements_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "app"."split_rooms"("split_room_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_settlements" ADD CONSTRAINT "split_settlements_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."split_settlements" ADD CONSTRAINT "split_settlements_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE RESTRICT ON UPDATE CASCADE;
