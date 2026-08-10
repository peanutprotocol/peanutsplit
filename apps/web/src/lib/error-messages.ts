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
 *   2. the surface-specific fallback, when the caller has one.
 *   3. `errors.generic` for an unknown code or thrown non-ApiError.
 *
 * The server message stays in trusted logs. It can contain a path, identifier or implementation
 * detail, so rolling-deploy compatibility must never turn it into UI copy.
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
    'JSON_REQUIRED',
    'REQUEST_TOO_LARGE',
    'CROSS_SITE_REQUEST',
    'NOT_FOUND',
    'EXPENSE_NOT_FOUND',
    'SETTLEMENT_NOT_FOUND',
    'SLUG_EXHAUSTED',
    'DUPLICATE_MEMBER_NAME',
    'MEMBER_HAS_HISTORY',
    'MEMBER_REACTIVATION_REQUIRED',
    'MEMBER_NAME_CONFLICT',
    'MEMBER_BALANCE_NOT_ZERO',
    'LAST_ACTIVE_MEMBER',
    'MEMBER_FORMER',
    'EXPENSE_DELETED',
    'NEW_PAYER_ON_EDIT',
    'CATCH_UP_REVIEW_CONFLICT',
    'HISTORY_CURSOR_INVALID',
    'NOT_A_MEMBER',
    'AMOUNT_NOT_POSITIVE',
    'AMOUNT_TOO_LARGE',
    // The expense's currency cannot be priced into the room's, so the amount has nowhere to go.
    'NO_RATE',
    'MANUAL_FX_RATE_REQUIRED',
    'MANUAL_FX_RATE_INVALID',
    'MANUAL_FX_RATE_NOT_ALLOWED',
    'EXACT_SHARES_REQUIRED',
    'SHARES_DO_NOT_ADD_UP',
    'WEIGHTED_SHARES_REQUIRED',
    'SPLIT_WEIGHT_NOT_POSITIVE',
    'PERCENTAGES_DO_NOT_ADD_UP',
    'SPLIT_FIELDS_DO_NOT_MATCH_MODE',
    'SPLIT_MODE_CONFLICT',
    'NO_PARTICIPANTS',
    'DUPLICATE_PARTICIPANT',
    'SETTLEMENT_PAYER_NOT_MEMBER',
    'SETTLEMENT_PAYEE_NOT_MEMBER',
    'SETTLEMENT_SAME_MEMBER',
    'SETTLEMENT_EXCEEDS_DEBT',
    'IDEMPOTENCY_KEY_REUSED',
    'MEMBER_TOKEN_INVALID',
    'INSTALL_HANDOFF_UNAVAILABLE',
    // Receipt scan.
    'SCAN_UNAVAILABLE',
    'SCAN_IMAGE_TOO_LARGE',
    'SCAN_BAD_IMAGE',
    'SCAN_NO_ITEMS',
    'SCAN_ROOM_LIMIT',
    'SCAN_FAILED',
    'IMPORT_TOO_LARGE',
    'IMPORT_UNAVAILABLE',
    'IMPORT_TARGET_CURRENCY_UNSUPPORTED',
    'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED',
    'UNSUPPORTED_PUSH_HOST',
    'PUSH_SUBSCRIPTION_LIMIT',
    'RATE_LIMITED',
] as const

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]

const isKnownCode = (code: string): code is KnownErrorCode => (KNOWN_ERROR_CODES as readonly string[]).includes(code)

type ErrorTranslator = (key: KnownErrorCode | 'generic') => string

/** Pure half of the hook, exported so the raw-message boundary has a canary test. */
export function errorMessageFor(error: unknown, translate: ErrorTranslator, fallback?: string): string {
    if (error instanceof ApiRequestError && isKnownCode(error.code)) return translate(error.code)
    return fallback ?? translate('generic')
}

/**
 * Returns a stable `(error) => string`. Every drawer that catches a mutation calls this instead
 * of reaching for `err.message`.
 *
 * `fallback` is for the cases where the surface knows better than a generic sentence — the
 * create-room form saying "could not create the room" beats "something went wrong".
 */
export function useErrorMessage(): (error: unknown, fallback?: string) => string {
    const t = useTranslations('errors')

    return (error: unknown, fallback?: string): string => errorMessageFor(error, t, fallback)
}
