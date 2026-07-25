-- A settle-up handed off to Peanut, tracked from the tap until the payment
-- confirms. The reference is opaque and stored rather than signed into a
-- token: nothing about the room (least of all its slug, which is the access
-- control) may travel to Peanut and back.
CREATE TYPE "app"."SplitSettleIntentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED');

CREATE TABLE "app"."split_settle_intents" (
    "split_settle_intent_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(64) NOT NULL,
    "room_id" UUID NOT NULL,
    "from_member_id" UUID NOT NULL,
    "to_member_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "app"."SplitSettleIntentStatus" NOT NULL DEFAULT 'PENDING',
    "peanut_payment_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "split_settle_intents_pkey" PRIMARY KEY ("split_settle_intent_id")
);

CREATE UNIQUE INDEX "split_settle_intents_reference_key" ON "app"."split_settle_intents"("reference");
CREATE INDEX "idx_split_settle_intent_room" ON "app"."split_settle_intents"("room_id");

ALTER TABLE "app"."split_settle_intents" ADD CONSTRAINT "split_settle_intents_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "app"."split_rooms"("split_room_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."split_settle_intents" ADD CONSTRAINT "split_settle_intents_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."split_settle_intents" ADD CONSTRAINT "split_settle_intents_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "app"."split_members"("split_member_id") ON DELETE RESTRICT ON UPDATE CASCADE;
