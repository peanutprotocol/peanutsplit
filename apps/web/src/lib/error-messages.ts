/**
 * One place that turns an API failure into something a person can read in their own language.
 *
 * The server keeps speaking English. Its `message` is for logs, for `curl`, and for whoever is
 * reading a Sentry breadcrumb at 2am — translating it there would mean the API needs a locale,
 * and an API that renders UI copy is an API you cannot change without shipping the frontend.
 * What the server does carry is a machine `code`, and that is what the client translates.
 *
 * Components used to render `err.message` straight onto the screen. That worked only because
 * every user read English; the moment they don't, an untranslated code needs a real fallback
 * chain, which is this:
 *
 *   1. `errors.<CODE>` from the catalog, if the code is one we know.
 *   2. the server's own English message, for a code shipped by a backend newer than this build.
 *   3. `errors.generic`, when there is no message at all (a thrown non-ApiError).
 *
 * Step 2 is the important one: a new backend code must degrade to "English but accurate", never
 * to "Something went wrong" — losing the only sentence that says what actually happened.
 */

'use client'

import { useTranslations } from 'next-intl'
import { ApiRequestError } from './api'

/**
 * Every code the server can currently emit. Kept as an explicit list rather than "try the key
 * and see" because a typo'd namespace would otherwise render the key path at the user, and
 * `pnpm i18n:audit` cannot check a key it never sees written down.
 */
export const KNOWN_ERROR_CODES = [
    'NETWORK_ERROR',
    'INTERNAL',
    'VALIDATION_ERROR',
    'MALFORMED_JSON',
    'NOT_FOUND',
    'EXPENSE_NOT_FOUND',
    'SETTLEMENT_NOT_FOUND',
    'SLUG_EXHAUSTED',
    'ROOM_ARCHIVED',
    'DUPLICATE_MEMBER_NAME',
    'EXPENSE_DELETED',
    'NOT_A_MEMBER',
    'AMOUNT_NOT_POSITIVE',
    'EXACT_SHARES_REQUIRED',
    'SHARES_DO_NOT_ADD_UP',
    'NO_PARTICIPANTS',
    'DUPLICATE_PARTICIPANT',
    'SETTLEMENT_PAYER_NOT_MEMBER',
    'SETTLEMENT_PAYEE_NOT_MEMBER',
    'SETTLEMENT_SAME_MEMBER',
    'MEMBER_TOKEN_INVALID',
    // Receipt scan.
    'SCAN_UNAVAILABLE',
    'SCAN_IMAGE_TOO_LARGE',
    'SCAN_BAD_IMAGE',
    'SCAN_NO_ITEMS',
    'SCAN_ROOM_LIMIT',
    'SCAN_FAILED',
    'IMPORT_TOO_LARGE',
    'RATE_LIMITED',
] as const

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]

const isKnownCode = (code: string): code is KnownErrorCode => (KNOWN_ERROR_CODES as readonly string[]).includes(code)

/**
 * Returns a stable `(error) => string`. Every drawer that catches a mutation calls this instead
 * of reaching for `err.message`.
 *
 * `fallback` is for the cases where the surface knows better than a generic sentence — the
 * create-room form saying "could not create the room" beats "something went wrong" — and is used
 * only when the error carries no usable message of its own.
 */
export function useErrorMessage(): (error: unknown, fallback?: string) => string {
    const t = useTranslations('errors')

    return (error: unknown, fallback?: string): string => {
        if (error instanceof ApiRequestError) {
            if (isKnownCode(error.code)) return t(error.code)
            // Unknown code: the server's English sentence is more useful than a generic one.
            if (error.message) return error.message
        }
        return fallback ?? t('generic')
    }
}
