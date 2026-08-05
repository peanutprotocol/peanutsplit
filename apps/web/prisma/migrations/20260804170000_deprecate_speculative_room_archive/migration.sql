DO $deprecate$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid =
              pg_catalog.to_regclass('"split"."Room"')
          AND attribute.attname = 'archivedAt'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
    ) THEN
        COMMENT ON COLUMN "split"."Room"."archivedAt" IS
            'DEPRECATED: no longer read or written by Peanut Split. Retained temporarily for rollback safety; do not use. Remove only through an explicitly scheduled, preflighted migration.';
    ELSE
        RAISE NOTICE
            'split.Room.archivedAt is absent; nothing to deprecate';
    END IF;
END
$deprecate$;
