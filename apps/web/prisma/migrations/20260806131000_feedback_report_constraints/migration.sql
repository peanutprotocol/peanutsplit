-- Keep screenshot bytes and metadata inseparable even for an operational/direct
-- write. Application validation is the friendly gate; this is the last one.
ALTER TABLE "split"."FeedbackReport"
ADD CONSTRAINT "FeedbackReport_screenshot_consistent_check"
CHECK (
    (
        "screenshot" IS NULL
        AND "screenshotMimeType" IS NULL
        AND "screenshotByteLength" IS NULL
        AND "screenshotWidth" IS NULL
        AND "screenshotHeight" IS NULL
    )
    OR
    (
        "screenshot" IS NOT NULL
        AND "screenshotMimeType" IN ('image/jpeg', 'image/png', 'image/webp')
        AND "screenshotByteLength" = octet_length("screenshot")
        AND "screenshotByteLength" BETWEEN 1 AND 2097152
        AND "screenshotWidth" BETWEEN 1 AND 20000
        AND "screenshotHeight" BETWEEN 1 AND 20000
    )
);
