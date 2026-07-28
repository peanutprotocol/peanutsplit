/**
 * The language a room is being STARTED in, for the one write that has to record
 * it.
 *
 * Why a room needs a language at all: the link preview. A crawler fetching
 * `/r/<slug>` on behalf of WhatsApp or Telegram carries no `ps-locale` cookie and
 * no `Accept-Language` worth trusting, so the unfurl — the single screen a
 * suspicious invitee reads before deciding whether to tap something a friend
 * dropped in a group chat — had no way to be anything but English. Everywhere
 * else the locale is a per-request fact and should stay one; this is the one
 * place it has to be remembered, and it is remembered on the room rather than on
 * the reader because the reader of a preview is not the room.
 *
 * Resolved through next-intl's own config rather than by re-reading the cookie,
 * so a room is stamped with exactly the language the creator's page rendered in —
 * one resolution chain, not a second one that can disagree with it.
 */

import { getLocale } from 'next-intl/server'

/**
 * Null when there is no request context to read, which is also what every room
 * written before this column existed holds, and what an import writes: null means
 * "nobody said", and English is what that renders as.
 *
 * Guarded on purpose. This is a nicety hanging off the one write that must never
 * fail — a context next-intl cannot resolve should cost a room its localized
 * preview and nothing else.
 */
export async function creationLocale(): Promise<string | null> {
    try {
        return await getLocale()
    } catch {
        return null
    }
}
