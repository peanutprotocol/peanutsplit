'use client'

/**
 * One line on the recap page: what YOU put in, and where you ended up.
 *
 * The recap is otherwise entirely about the group — a total, a headcount, a top
 * payer — which is a fine artefact to share and a strange thing to read about a
 * trip you were on. This is the line that answers "and me?".
 *
 * It is on the PAGE and deliberately not on the shared image. The card leaves
 * the group and gets forwarded; a per-person number on it would be somebody's
 * balance posted to a chat they are not in.
 *
 * Renders nothing at all unless this device holds an identity for this room that
 * still matches the roster. A recap opened from a link by someone who is not a
 * member is the common case, and a line about "you" would be about nobody.
 */

import { useLocale, useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { deriveBalance } from '@/lib/balance-derivation'
import { addMinor, formatMoney, isZeroMinor } from '@/lib/money'
import { useCurrencies, roomKey } from '@/lib/queries'
import { useRoomIdentity } from '@/lib/use-identity'

export function RecapPersonalLine({ slug }: { slug: string }) {
    const t = useTranslations('room.recap')
    const locale = useLocale()
    const { identity, loaded } = useRoomIdentity(slug)
    const { data: currencies } = useCurrencies()

    /**
     * The same cache key the room screen uses, so walking back into the room is
     * already warm — but without its polling or its event stream. A recap is a
     * snapshot of something that is over; subscribing it to live updates would be
     * a socket held open for a screen nobody is transacting on.
     */
    const { data: state } = useQuery({
        queryKey: roomKey(slug),
        queryFn: ({ signal }) => api.room(slug, signal),
        enabled: loaded && !!identity,
        staleTime: 30_000,
        retry: 1,
    })

    const meId = identity?.memberId
    if (!state || !meId || !state.members.some((member) => member.id === meId)) return null

    // "Put in" is what they fronted, not their net position — the two are
    // different numbers and the sentence says which one it means. The paid lines
    // are already in room currency and already exclude deleted and unsent rows.
    const derivation = deriveBalance(state, meId)
    const paidMinor = addMinor(derivation.lines.filter((line) => line.kind === 'paid').map((line) => line.amountMinor))
    if (paidMinor === '0' && isZeroMinor(state.balances[meId] ?? '0')) return null

    const net = state.balances[meId] ?? '0'
    const money = (minor: string) => formatMoney(minor, state.room.currency, currencies, locale)
    const position = isZeroMinor(net)
        ? t('youSettled')
        : net.startsWith('-')
          ? t('youOwe', { amount: money(net.replace('-', '')) })
          : t('youGetBack', { amount: money(net) })

    return (
        <p data-testid="recap-personal" className="text-sm font-medium">
            {t('yourLine', { amount: money(paidMinor), position })}
        </p>
    )
}
