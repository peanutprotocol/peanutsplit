-- Double-tapping "mark as paid" recorded the payment twice and flipped who
-- owed whom. The key is unique per room, so the retry collides instead.
-- Postgres treats NULLs as distinct, so unkeyed settlements are unaffected.
ALTER TABLE "app"."split_settlements" ADD COLUMN "idempotency_key" VARCHAR(64);

CREATE UNIQUE INDEX "uniq_split_settlement_idempotency" ON "app"."split_settlements"("room_id", "idempotency_key");
