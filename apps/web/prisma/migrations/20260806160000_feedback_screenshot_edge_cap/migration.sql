-- The screenshot backstop was written before the app had a pixel limit, so it
-- allowed a 20000px edge. The form now downscales to MAX_FEEDBACK_SCREENSHOT_EDGE
-- (1600) and the route proves that against the decoded pixels, which left the
-- database accepting an attachment the product itself would refuse. Bring the
-- last gate back in line with the first two.

-- A row stored before the app limit existed would fail the tightened check and
-- take the whole deploy with it. Drop only the attachment from such a row — the
-- all-NULL branch below is valid, so the reporter's prose and diagnostics stay.
UPDATE "split"."FeedbackReport"
SET "screenshot" = NULL,
    "screenshotMimeType" = NULL,
    "screenshotByteLength" = NULL,
    "screenshotWidth" = NULL,
    "screenshotHeight" = NULL
WHERE "screenshotWidth" > 1600
   OR "screenshotHeight" > 1600;

ALTER TABLE "split"."FeedbackReport"
DROP CONSTRAINT "FeedbackReport_screenshot_consistent_check";

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
        AND "screenshotWidth" BETWEEN 1 AND 1600
        AND "screenshotHeight" BETWEEN 1 AND 1600
    )
);
