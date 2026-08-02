import type { Metadata } from 'next'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { AchievementShelf } from '@/components/room/AchievementShelf'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { RecapPersonalLine } from '@/components/room/RecapPersonalLine'
import { WrappedDeck } from '@/components/room/WrappedDeck'
import { RecapViewed } from '@/components/room/RecapViewed'
import { RoomNotFound } from '@/components/room/RoomStates'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { asLocale } from '@/i18n/locales'
import { formatMoney } from '@/lib/money'
import { storyBucketFor } from '@/lib/story'
import { loadRecap } from '@/server/og/recapCard'
import { recapMetadata } from '@/server/og/roomMeta'

/**
 * The trip recap — the members' screen behind the second shareable artefact.
 *
 * ── Why this page is NOT the thing that gets shared ────────────────────────
 * Its URL contains the room slug, and the slug is the room's access control:
 * anyone who opens `/r/<slug>/recap` can strip the `/recap` and land in a
 * ledger they can write to. Posting that link to a public feed would be handing
 * strangers the keys, so the shared artefact is the PNG this page hands you —
 * `navigator.share({ files })`, no URL, no slug, the domain printed on the card
 * instead. `@/lib/recap` carries the full argument; this page just obeys it.
 *
 * It renders for an unsettled room too — a recap of so far is a real thing to
 * look at mid-trip — but the share button appears only once the room has
 * actually reached zero. Sharing "we are €400 apart" is a different artefact
 * with a different message, and the card's SETTLED stamp would be a lie.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    return recapMetadata(slug)
}

// Live room state behind a secret slug. Nothing here is worth prerendering, and
// the build has no database.
export const dynamic = 'force-dynamic'

/** Faces before the row collapses into `+N`. Wider than the OG card's six —
 *  this one is scrollable HTML, not a 1200px canvas. */
const MAX_FACES = 8

export default async function RecapPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const recap = await loadRecap(slug)
    if (!recap) return <RoomNotFound />

    const t = await getTranslations('room.recap')
    const tStory = await getTranslations('room.story')
    const locale = asLocale(await getLocale())
    const faces = recap.members.slice(0, MAX_FACES)
    const overflow = recap.members.length - faces.length

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-background px-4 py-8">
            <RecapViewed slug={slug} settled={recap.settled} />

            <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h4">
                    <RoomEmblem value={recap.emoji} name={recap.name} size={30} />
                </span>
                <div className="min-w-0">
                    {/* The room name is the page's one h1 — the same thing `RoomHeader`
                        makes the h1 in the room, so walking from one to the other does
                        not change what the screen is called. */}
                    <h1 className="truncate text-h5">{recap.name}</h1>
                    <p className="text-h10 uppercase tracking-wide text-grey-1">
                        {recap.settled ? t('settledBadge') : t('ongoingBadge')}
                    </p>
                </div>
            </div>

            {/* The number is the headline, the same way it is on the card — the
                screen and the artefact should say the same thing in the same order. */}
            <Card shadowSize="6" className={recap.settled ? 'gap-2 bg-green-1 px-4 py-6' : 'gap-2 px-4 py-6'}>
                <h2 className="text-h10 uppercase tracking-wide text-n-1/70">{t('totalLabel')}</h2>
                <p className="text-h1 leading-none" data-testid="recap-total">
                    {formatMoney(recap.totalMinor, recap.currency, undefined, locale)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    {recap.dayCount > 0 && (
                        <>
                            <span>{t('days', { count: recap.dayCount })}</span>
                            <span aria-hidden="true" className="text-n-1/40">
                                ·
                            </span>
                        </>
                    )}
                    <span>{t('expenses', { count: recap.expenseCount })}</span>
                    <span aria-hidden="true" className="text-n-1/40">
                        ·
                    </span>
                    <span>{t('people', { count: recap.memberCount })}</span>
                </p>
                {/* The epilogue — same line the settled card shows in the room, so
                    the screen and the screenshot tell one story. Settled only: a
                    trip still running has not earned its last sentence. */}
                {recap.settled && (
                    <p className="mt-1 text-sm font-medium text-n-1/70">
                        {tStory(
                            storyBucketFor({
                                dayCount: recap.dayCount,
                                expenseCount: recap.expenseCount,
                                memberCount: recap.memberCount,
                            }),
                            { days: recap.dayCount, count: recap.memberCount, rounds: recap.expenseCount }
                        )}
                    </p>
                )}
            </Card>

            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    {faces.map((member) => (
                        <MemberAvatar key={member.name} name={member.name} avatar={member.avatar} size={40} />
                    ))}
                    {overflow > 0 && <span className="text-sm font-bold text-grey-1">{`+${overflow}`}</span>}
                </div>
                {recap.topPayerName && recap.memberCount > 1 && (
                    <p className="text-sm font-medium">{t('topPayer', { name: recap.topPayerName })}</p>
                )}
                <p className="text-sm text-grey-1">{t('settlements', { count: recap.settlementCount })}</p>
                {/* Client-side, from the room state this device can already read — the
                    server render has no idea who is holding the phone, and the whole
                    identity model is "the link plus what is in localStorage". */}
                <RecapPersonalLine slug={slug} />
            </div>

            {/* "Share the story" lives in the deck's leading tile and nowhere else. It used to
                sit here as a bare button too, one screen above an identical one — same label,
                same PNG — and the tile is the better of the two because it shows the card you
                are about to send.

                Both are client-side and read the device's own identity, for the same reason
                `RecapPersonalLine` is: the server render does not know who is holding the phone,
                and an alter ego is about exactly that person. The deck belongs to the closed book;
                the shelf is what the trip unlocked. They overlap, so when the deck is up the shelf
                stands down on the cards the deck already draws — see `deckShown`. */}
            {recap.settled && <WrappedDeck slug={slug} />}
            <AchievementShelf slug={slug} deckShown={recap.settled} />

            {/* `min-h-11` and the side padding, not just the text: the label alone was a 21px
                strip, under the 40px a thumb needs. Hugging the label rather than the full
                column width keeps the whole row from being a back button. */}
            <Link
                href={`/r/${slug}`}
                className="flex min-h-11 items-center justify-center self-center px-4 text-sm font-bold text-n-1 underline"
            >
                {t('backToRoom')}
            </Link>

            {/* This screen is reached by members, but a recap gets screenshotted and
                passed around a group that is not all users yet — so it carries the
                one acquisition ask, tagged so the funnel can see it. */}
            <div className="mt-auto flex flex-col gap-3 rounded-sm border border-n-1 bg-white px-4 py-6 text-center">
                <p className="text-h6">{t('ctaTitle')}</p>
                <p className="text-sm text-grey-1">{t('ctaBody')}</p>
                <Link href="/app?utm_source=recap">
                    <Button variant="stroke" className="justify-center">
                        {t('cta')}
                    </Button>
                </Link>
            </div>
        </main>
    )
}
