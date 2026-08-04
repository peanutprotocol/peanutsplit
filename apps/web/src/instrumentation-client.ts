/**
 * Browser-side Sentry. Next 15+ loads this file automatically (it aliases
 * `src/instrumentation-client`), so no `withSentryConfig` wrapper and no
 * build-time source-map upload — nothing here needs an auth token.
 *
 * Client only, on purpose: the production container has no egress, so a
 * server-side SDK could never deliver an event and would only add latency to
 * every route handler.
 *
 * No DSN → no init, exactly like analytics.ts. Local dev and self-hosters get
 * silence rather than console noise.
 */
import * as Sentry from '@sentry/nextjs'
import { redactField, redactRoomSlugs, redactTelemetryEvent } from '@/lib/redact'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        // Errors only. Tracing would sample room URLs into transaction names and
        // buys nothing on a two-screen app; replay would record the room itself.
        tracesSampleRate: 0,
        integrations: (defaults) =>
            defaults.filter((integration) => integration.name !== 'BrowserTracing' && integration.name !== 'Replay'),

        /** The slug is the room's credential and it lives in every URL we touch. */
        beforeSend(event) {
            // This defensive pass covers SDK/integration fields that can bypass
            // beforeBreadcrumb, including exception and transaction strings.
            return redactTelemetryEvent(event)
        },

        /** Navigation and fetch crumbs carry the full path; scrub at capture time
         *  so a slug never sits in the in-memory buffer either. */
        beforeBreadcrumb(crumb) {
            redactField(crumb.data, 'url')
            redactField(crumb.data, 'from')
            redactField(crumb.data, 'to')
            if (crumb.message) crumb.message = redactRoomSlugs(crumb.message)
            return crumb
        },
    })
}
