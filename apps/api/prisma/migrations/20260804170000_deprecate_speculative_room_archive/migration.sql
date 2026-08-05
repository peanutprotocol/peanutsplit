DO $deprecate$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid =
              pg_catalog.to_regclass('"app"."split_rooms"')
          AND attribute.attname = 'archived_at'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
    ) THEN
        COMMENT ON COLUMN "app"."split_rooms"."archived_at" IS
            'DEPRECATED: no longer read or written by Peanut Split. Retained temporarily for rollback safety; do not use. Remove only through an explicitly scheduled, preflighted migration.';
    ELSE
        RAISE NOTICE
            'app.split_rooms.archived_at is absent; nothing to deprecate';
    END IF;
END
$deprecate$;
