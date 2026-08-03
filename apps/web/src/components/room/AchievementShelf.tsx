'use client'

/**
 * What this trip unlocked, kept.
 *
 * Each tile IS the card — the same PNG the share button hands to the operating system, drawn with
 * an `<img>`. No second art system in HTML, and the shelf is WYSIWYG with what gets shared.
 *
 * Locked achievements are deliberately absent. A grid of grey padlocks turns a ledger into a game,
 * and Split is not one.
 *
 * Built the same way `RecapPersonalLine` is: a client component that reads the device identity and
 * the shared react-query cache rather than being fed by the server page, with no polling — a recap
 * is a snapshot of something that is over.
 */

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { achievementCardPath, shelfKinds, type AlterEgoCardParams, type CardKind } from '@/lib/achievements-contract'
import { unlocksFor } from '@/lib/achievements'
import { api } from '@/lib/api'
import { roomKey } from '@/lib/queries'
import { useRoomIdentity } from '@/lib/use-identity'
import { CardShareButton, type ShareableCardKind } from './CardShareButton'

export function AchievementShelf({ slug, deckShown = false }: { slug: string; deckShown?: boolean }) {
    const t = useTranslations('room.achievements')
    const { identity, loaded } = useRoomIdentity(slug)

    const { data: state } = useQuery({
        queryKey: roomKey(slug),
        queryFn: ({ signal }) => api.room(slug, signal),
        enabled: loaded && !!identity,
        staleTime: 30_000,
        retry: 1,
    })

    if (!state) return null

    const tiles = unlocksFor(state, identity?.memberId)
        .filter((unlock) => unlock.type !== 'wrapped')
        .map((unlock) => ({
            key: unlock.id,
            kind: (unlock.type === 'crew' ? 'crew' : unlock.type === 'passport' ? 'passport' : 'alterego') as CardKind &
                ShareableCardKind,
            type: unlock.type,
            params:
                unlock.detail.award && unlock.detail.persona
                    ? ({
                          award: unlock.detail.award,
                          persona: unlock.detail.persona,
                          palette: unlock.detail.palette,
                      } satisfies AlterEgoCardParams)
                    : undefined,
        }))

    // On a settled room the deck above is the wrapped surface and already draws these — see
    // `shelfKinds` for why the deck wins.
    const keep = new Set<CardKind>(
        shelfKinds(
            tiles.map((tile) => tile.kind),
            deckShown
        )
    )
    const shown = tiles.filter((tile) => keep.has(tile.kind))

    if (shown.length === 0) return null

    return (
        <section className="flex flex-col gap-3" data-testid="achievement-shelf">
            <h2 className="text-h10 uppercase tracking-wide text-grey-1">{t('shelfTitle')}</h2>
            {shown.map((tile) => (
                <div key={tile.key} className="flex flex-col gap-2">
                    {/* Empty alt: the card is decoration for the button beneath it, and its
                        content is already the heading and the copy on this page. */}
                    <img
                        src={achievementCardPath(slug, tile.kind, tile.params)}
                        loading="lazy"
                        alt=""
                        className="aspect-[1200/630] w-full rounded-sm border border-n-1 bg-white"
                    />
                    <CardShareButton
                        slug={slug}
                        kind={tile.kind}
                        type={tile.type}
                        params={tile.params}
                        variant="stroke"
                    />
                </div>
            ))}
        </section>
    )
}
