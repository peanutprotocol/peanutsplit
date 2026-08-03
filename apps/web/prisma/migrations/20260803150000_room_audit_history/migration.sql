-- A canonical, append-only room history. Existing rows cannot be reconstructed
-- honestly, so each existing room gets one explicit boundary marker.
CREATE TABLE "split"."RoomAuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "actorDeviceHash" TEXT,
    "deviceOrdinal" INTEGER,
    "actorMemberId" TEXT,
    "actorMemberName" TEXT,
    "before" JSONB,
    "after" JSONB,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoomAuditEvent_roomId_id_idx"
ON "split"."RoomAuditEvent"("roomId", "id");

CREATE INDEX "RoomAuditEvent_roomId_actorDeviceHash_idx"
ON "split"."RoomAuditEvent"("roomId", "actorDeviceHash");

ALTER TABLE "split"."RoomAuditEvent"
ADD CONSTRAINT "RoomAuditEvent_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "split"."Room"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "split"."RoomAuditEvent" (
    "roomId", "action", "subjectType", "subjectId", "detail", "createdAt"
)
SELECT
    "id",
    'history_started',
    'room',
    "id",
    jsonb_build_object('reason', 'History was introduced after this room was created. Earlier actions are unavailable.'),
    CURRENT_TIMESTAMP
FROM "split"."Room";

CREATE FUNCTION "split"."prevent_room_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'room audit events are append-only';
END;
$$;

CREATE TRIGGER "RoomAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "split"."RoomAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "split"."prevent_room_audit_event_mutation"();
