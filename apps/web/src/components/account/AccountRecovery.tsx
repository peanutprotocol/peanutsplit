'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { parseAsString, useQueryStates } from 'nuqs'
import { toast } from 'sonner'
import { collectMemberships, planRecovery } from '@/lib/account-recovery'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useErrorMessage } from '@/lib/error-messages'
import { accountsEnabled } from '@/lib/flags'
import { readIdentity, writeIdentity } from '@/lib/identity'
import { notifyRoomsChanged, readRecentRooms, rememberRoom } from '@/lib/recent-rooms'
import { useAccount } from '@/lib/use-account'

/**
 * The moment the whole accounts feature exists for.
 *
 * `POST /api/auth/verify` lands here with `?login=1` and a fresh session cookie.
 * Two things then happen, in this order and only once:
 *
 *  1. attach — hand the account every membership this device can prove, so a
 *     room joined before signing up is not left behind;
 *  2. recover — ask what the account already owns and fold it into local
 *     storage, writing the member token for any room this device does not know.
 *     That second write is the new-phone case: rooms whose links are gone come
 *     back, as you, with your history intact.
 *
 * Renders nothing. It is an effect with a toast.
 */
export function AccountRecovery() {
    const t = useTranslations('account')
    const errorMessage = useErrorMessage()
    const { data: account, isPending } = useAccount()
    const [{ login }, setParams] = useQueryStates(
        { login: parseAsString.withDefault('') },
        // Replace, not push: the browser got here on a 303 and the back button
        // should leave the site, not re-enter a spent login.
        { history: 'replace' }
    )
    const ran = useRef(false)

    useEffect(() => {
        if (!accountsEnabled() || login !== '1' || ran.current) return
        // The session query decides whether there is anything to recover, so
        // nothing starts until it has answered. Strict mode double-invokes this
        // effect and React Query re-renders it several times — the ref is what
        // makes "once per mount" true rather than "once per render pass".
        if (isPending) return
        ran.current = true

        void (async () => {
            try {
                if (!account) return

                const claims = collectMemberships(
                    readRecentRooms().map((room) => room.slug),
                    readIdentity
                )
                if (claims.length > 0) {
                    // Deliberately swallowed. Attaching is the nice-to-have half;
                    // the rooms the account already owns are the half somebody
                    // just clicked a link in their inbox for.
                    await api.account.attach(claims).catch(() => [])
                }

                const rooms = await api.account.rooms()
                const plan = planRecovery(rooms, { recent: readRecentRooms(), readIdentity, now: Date.now() })
                // Identities first: a list that re-renders from the event below
                // should already know who you are in the rooms it is showing.
                for (const entry of plan.identities) writeIdentity(entry.slug, entry.identity)
                for (const room of plan.remember) rememberRoom(room)
                notifyRoomsChanged()

                // A count, never a slug.
                track('account_rooms_recovered', { rooms: rooms.length })
                toast.success(rooms.length > 0 ? t('roomsAreBack') : t('signedIn'))
            } catch (err) {
                toast.error(errorMessage(err))
            } finally {
                // The param has done its job either way, and it must not survive
                // a refresh — re-running attach on every reload would be a slow
                // way to re-post fifty memberships.
                void setParams({ login: null })
            }
        })()
    }, [account, isPending, login, setParams, t, errorMessage])

    return null
}
