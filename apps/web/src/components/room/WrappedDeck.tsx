'use client'

/**
 * The trip, wrapped — a snap-scroll row of individually shareable cards.
 *
 * Which tiles render is conditional, and has to be: a single-currency trip has no passport, and a
 * seventh member has no alter ego to put in a URL. The roadmap asked for three to five cards for
 * exactly this reason, and the copy counts the tiles rather than claiming five.
 *
 * The `recap` tile is the existing `RecapShareButton` behind a tile-shaped skin. It keeps firing
 * `recap_shared` and fires NO achievement event: it already has its own funnel, and counting one
 * share in two measures undercounts the first and pollutes the second.
 */

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
    CARD_TYPE,
    WRAPPED_DECK,
    achievementCardPath,
    type AlterEgoCardParams,
    type WrappedCard,
} from '@/lib/achievements-contract'
import { markSeen, readSeen } from '@/lib/achievement-storage'
import { awardsFor } from '@/lib/achievements'
import { achievementProps, track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { savedExpenses } from '@/lib/pending'
import { roomKey } from '@/lib/queries'
import { recapImagePath } from '@/lib/recap'
import { useRoomIdentity } from '@/lib/use-identity'
import { FALLBACK_AVATAR_KEY } from '@/lib/avatars'
import { CardShareButton, type ShareableCardKind } from './CardShareButton'
import { RecapShareButton } from './RecapShareButton'

export function WrappedDeck({ slug }: { slug: string }) {
    const t = useTranslations('room.achievements')
    const { identity, loaded } = useRoomIdentity(slug)
    const counted = useRef(false)

    const { data: state } = useQuery({
        queryKey: roomKey(slug),
        queryFn: ({ signal }) => api.room(slug, signal),
        enabled: loaded && !!identity,
        staleTime: 30_000,
        retry: 1,
    })

    /**
     * WRAPPED's exposure event. The deck is its only surface — there is no in-room moment for it,
     * because the all-settled celebration already is one — so the event is fired here, once per
     * device, in the same place the seen-set is written.
     */
    useEffect(() => {
        if (!state || counted.current) return
        counted.current = true
        if (readSeen(slug).has('wrapped')) return
        markSeen(slug, ['wrapped'])
        track('achievement_seen', achievementProps('wrapped'))
    }, [slug, state])

    if (!state) return null

    const expenses = savedExpenses(state.expenses)
    const currencies = new Set(expenses.map((expense) => expense.currency))
    const meId = identity?.memberId
    const award = meId ? awardsFor(state)[meId] : undefined
    const me = state.members.find((member) => member.id === meId)
    const params: AlterEgoCardParams | undefined = award
        ? { award, persona: me?.avatar ?? FALLBACK_AVATAR_KEY, palette: me?.avatarPalette }
        : undefined

    const renders = (card: WrappedCard): boolean => {
        if (card === 'passport') return currencies.size >= 2
        if (card === 'alterego') return !!params
        if (card === 'landing') return state.settlements.length > 0
        return true
    }

    const tiles = WRAPPED_DECK.filter(renders)
    if (tiles.length === 0) return null

    return (
        <section className="flex flex-col gap-3" data-testid="wrapped-deck">
            <div className="flex flex-col gap-1">
                <h2 className="text-h6">{t('wrapped.title')}</h2>
                <p className="text-sm text-grey-1">{t('wrapped.body', { count: tiles.length })}</p>
            </div>
            {/* `-mx-4 px-4` lets the row bleed to the screen edge inside the page's padding, so a
                tile can sit half-visible and read as scrollable rather than as a cut-off card. */}
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
                {tiles.map((card) => (
                    <div key={card} className="flex w-[85vw] max-w-sm shrink-0 snap-start flex-col gap-2">
                        <img
                            src={card === 'recap' ? recapImagePath(slug) : achievementCardPath(slug, card, params)}
                            loading="lazy"
                            alt=""
                            className="aspect-[1200/630] w-full rounded-sm border border-n-1 bg-white"
                        />
                        {card === 'recap' ? (
                            <RecapShareButton slug={slug} variant="stroke" />
                        ) : (
                            <CardShareButton
                                slug={slug}
                                kind={card as ShareableCardKind}
                                type={CARD_TYPE[card]!}
                                params={card === 'alterego' ? params : undefined}
                                variant="stroke"
                            />
                        )}
                    </div>
                ))}
            </div>
        </section>
    )
}
