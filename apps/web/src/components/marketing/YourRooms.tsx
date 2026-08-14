'use client'
import { RoomEmblem } from '@/components/room/RoomEmblem'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, type Variants } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'
import { api, isApiError } from '@/lib/api'
import { readRecentRooms, rememberRoom, roomSlugFromLink, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { forgetRoomFromDevice } from '@/lib/use-identity'
import { riseSoftVariants, sceneVariants } from './motion'

const COLLAPSED_LIMIT = 5

/** Only the link is a motion component: `whileTap` on the `<li>` would make motion give every card a tab stop. */
const RoomCardLink = motion.create(Link)

/**
 * A function rather than `staggerChildren`, for two reasons: only the function form is applied
 * to cards that mount after the scene has settled (the reveal control adds a second batch), and
 * capping the index keeps a long history from cascading for a second.
 */
const roomListVariants: Variants = {
    hidden: {},
    shown: { transition: { delayChildren: (index: number) => Math.min(index, 5) * 0.06 } },
}

/** A saved room is a physical tile: it rises and settles rather than fading. */
const roomCardVariants: Variants = {
    hidden: { opacity: 0, y: 14, scale: 0.97 },
    shown: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring', stiffness: 300, damping: 26, delayChildren: 0.04 },
    },
}

/** The colour tile is what you actually recognise, so it lands last, and lands playing. */
const emblemVariants: Variants = {
    hidden: { opacity: 0, scale: 0.7, rotate: -10 },
    shown: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 500, damping: 20 } },
}

/**
 * "3 hours ago" in whatever language the room list is being read in. Was pinned to 'en', which
 * put an English timestamp under a Portuguese room name.
 */
const relativeTime = (epochMs: number, locale: string): string => {
    if (!epochMs) return ''
    const minutes = Math.round((epochMs - Date.now()) / 60_000)
    const abs = Math.abs(minutes)
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    if (abs < 60) return format.format(minutes, 'minute')
    if (abs < 60 * 24) return format.format(Math.round(minutes / 60), 'hour')
    if (abs < 60 * 24 * 30) return format.format(Math.round(minutes / (60 * 24)), 'day')
    return format.format(Math.round(minutes / (60 * 24 * 30)), 'month')
}

/**
 * Device-local room history is the one permitted personal fold on marketing and the full history
 * surface in the app. Reads localStorage after mount (never during render, so SSR and hydration
 * agree). Paste-link recovery belongs to the app home, including when the device has no history.
 */
export function YourRooms({ surface = 'landing' }: { surface?: 'landing' | 'app' }) {
    const router = useRouter()
    const t = useTranslations('marketing.rooms')
    const locale = useLocale()
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()
    const [recent, setRecent] = useState<RecentRoom[]>([])
    /**
     * What this person asked the list to do, `null` until they ask anything.
     *
     * One value rather than an `expanded` flag plus a "have they touched it" flag,
     * because the two can never be allowed to disagree: an untouched list is the
     * only thing the compact rule below is allowed to key on.
     */
    const [reveal, setReveal] = useState<'all' | 'fewer' | null>(null)
    const expanded = reveal === 'all'
    const [pastedLink, setPastedLink] = useState('')
    const [recovering, setRecovering] = useState(false)
    const [recoveryError, setRecoveryError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    /** The room waiting on a confirm. This list is the only copy of the link this
     *  device holds, so dropping a room is not something a mis-tap should do. */
    const [pendingForget, setPendingForget] = useState<RecentRoom | null>(null)
    const [forgetError, setForgetError] = useState<string | null>(null)
    /**
     * The room the sheet is ABOUT, which outlives the confirm.
     *
     * The sheet animates itself out, and it can only do that while its content is
     * still there to animate. Rendering the content off `pendingForget` unmounted
     * the whole sheet in the same render that closed it, so this one sheet
     * disappeared instantly while every other one slid away.
     */
    const [forgetSubject, setForgetSubject] = useState<RecentRoom | null>(null)

    const askForget = (room: RecentRoom) => {
        setForgetError(null)
        setForgetSubject(room)
        setPendingForget(room)
    }

    const closeForget = () => {
        setForgetError(null)
        setPendingForget(null)
    }

    useEffect(() => {
        setRecent(readRecentRooms())
    }, [])

    // Hiding a single sixth room behind a passive "and 1 more" footer made the
    // list look truncated by accident. Six is still a compact history, so show it
    // outright; larger histories get an explicit reveal control.
    //
    // "Untouched" is the load-bearing half. Once somebody has WORKED the control,
    // the control's own promise governs instead — a button that says "Show fewer
    // rooms" and then shows all six of them is a worse lie than a sixth room
    // behind a reveal.
    const compact = recent.length === COLLAPSED_LIMIT + 1 && reveal === null
    const collapsedLimit = compact ? recent.length : COLLAPSED_LIMIT
    const visible = expanded ? recent : recent.slice(0, collapsedLimit)
    const overflow = recent.length - visible.length
    // `expanded ||` is what was missing. Derived from the limit alone, the control
    // vanished the moment forgetting a room brought an EXPANDED list down to a
    // count the limit already covered: "Show fewer rooms" disappeared under the
    // finger that had just deleted something, and the list stayed expanded with no
    // way back. Whatever the count, an expanded list can always be collapsed.
    const canCollapse = expanded || recent.length > collapsedLimit

    if (surface === 'landing' && recent.length === 0) return null

    const forget = (room: RecentRoom): boolean => {
        if (!forgetRoomFromDevice(room.slug)) {
            const message = t('forgetFailed', { room: room.name })
            setNotice(message)
            setForgetError(message)
            feedback('error', { haptic: 'error' })
            return false
        }
        setForgetError(null)
        setPendingForget(null)
        setRecent((current) => current.filter((candidate) => candidate.slug !== room.slug))
        setNotice(t('forgotten', { room: room.name }))
        feedback('tick')
        return true
    }

    const recover = async (event: React.FormEvent) => {
        event.preventDefault()
        setNotice(null)
        setRecoveryError(null)

        const slug = roomSlugFromLink(pastedLink, window.location.origin)
        if (!slug) {
            setRecoveryError(t('recovery.invalid'))
            return
        }

        setRecovering(true)
        try {
            const state = await api.room(slug)
            const saved = rememberRoom({
                slug: state.room.slug,
                name: state.room.name,
                emoji: state.room.emoji ?? undefined,
                theme: state.room.theme ?? undefined,
            })
            setRecent(readRecentRooms())
            setPastedLink('')
            setRecoveryError(null)
            const recoveryNotice = t(saved ? 'recovery.openingSaved' : 'recovery.openingUnsaved', {
                room: state.room.name,
            })
            setNotice(recoveryNotice)
            // The room opens immediately, so the status must survive that client
            // navigation. A root toast does; a paragraph on the landing page does
            // not. This is especially important when localStorage was denied.
            toast(recoveryNotice, { duration: TOAST_MS.actionable })
            feedback('pop')
            router.push(`/r/${state.room.slug}`)
        } catch (error) {
            setRecoveryError(
                isApiError(error, 'NOT_FOUND') || isApiError(error, 'ROOM_NOT_FOUND')
                    ? t('recovery.notFound')
                    : t('recovery.failed')
            )
        } finally {
            setRecovering(false)
        }
    }

    return (
        // The list can only exist after a localStorage read, so it necessarily
        // arrives one frame late. Staggering it in turns that unavoidable pop
        // into something that looks intended.
        //
        // Mount-driven rather than `whileInView`: cards keep arriving after the
        // scene has settled (the read on /app, the reveal control), and motion
        // propagates an inherited `animate` to a late child but never an
        // inherited `whileInView` — those cards would stay at opacity 0.
        <motion.section
            variants={sceneVariants}
            initial={motionAllowed ? 'hidden' : false}
            animate="shown"
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-motion-surface
            data-testid="recent-rooms"
            data-surface={surface}
            className="mx-auto w-full max-w-xl px-5 py-8 sm:py-10"
        >
            {recent.length > 0 && (
                <>
                    <motion.div
                        variants={riseSoftVariants}
                        data-motion-surface
                        className="flex items-baseline justify-between gap-4"
                    >
                        <h2 className="text-h5">{t('title')}</h2>
                        <span className="text-right text-sm text-grey-1">{t('subtitle')}</span>
                    </motion.div>

                    <motion.ul
                        variants={roomListVariants}
                        id="recent-room-list"
                        data-testid="recent-room-list"
                        data-motion-surface
                        className="mt-4 flex flex-col gap-3"
                    >
                        {visible.map((room) => (
                            <motion.li
                                key={room.slug}
                                variants={roomCardVariants}
                                whileHover={motionAllowed ? { y: -2 } : undefined}
                                data-motion-surface
                                className="shadow-4 flex overflow-hidden rounded-sm border border-n-1 bg-white"
                            >
                                <RoomCardLink
                                    href={`/r/${room.slug}`}
                                    data-focus-contained
                                    whileTap={motionAllowed ? { scale: 0.97 } : undefined}
                                    onClick={() => feedback('whoosh')}
                                    aria-label={`${t('openLabel')}: ${room.name}`}
                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-l-sm p-3 transition-colors hover:bg-primary-4/20"
                                >
                                    {/* The tile wears the room's own palette. Eight rooms rendered in
                                        one lavender square are eight identical rows you have to READ;
                                        the colour is the thing you actually recognise, and it is the
                                        same colour the room's header will be a tap later. Lavender
                                        stays the literal fallback, so an unthemed room is unchanged. */}
                                    <motion.span
                                        aria-hidden="true"
                                        variants={emblemVariants}
                                        data-motion-surface
                                        style={room.theme ? { backgroundColor: themeFor(room.theme).field } : undefined}
                                        className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-3 text-h5"
                                    >
                                        <RoomEmblem value={room.emoji} name={room.name} size={30} />
                                    </motion.span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-h7">{room.name}</span>
                                        <span className="block text-sm text-grey-1">
                                            {relativeTime(room.lastSeenAt, locale)}
                                        </span>
                                    </span>
                                    <Icon name="chevron-right" size={20} className="shrink-0 text-n-1" />
                                </RoomCardLink>
                                <button
                                    type="button"
                                    onClick={() => askForget(room)}
                                    aria-label={t('forgetLabel', { room: room.name })}
                                    data-testid="forget-room"
                                    data-room={room.slug}
                                    data-focus-contained
                                    className="flex min-w-12 shrink-0 items-center justify-center rounded-r-sm border-l border-n-1 text-grey-1 transition-colors hover:bg-primary-4/30 hover:text-n-1"
                                >
                                    <Icon name="trash" size={19} aria-hidden="true" />
                                </button>
                            </motion.li>
                        ))}
                    </motion.ul>

                    {canCollapse && (
                        // The press nudge moved from `active:translate-y-px` to `whileTap`: the entrance
                        // holds an inline transform, which a Tailwind transform utility cannot outrank.
                        <motion.button
                            type="button"
                            variants={riseSoftVariants}
                            whileTap={motionAllowed ? { y: 1 } : undefined}
                            data-motion-surface
                            onClick={() => {
                                setReveal(expanded ? 'fewer' : 'all')
                                feedback('blip')
                            }}
                            aria-expanded={expanded}
                            aria-controls="recent-room-list"
                            data-testid="more-rooms"
                            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 py-1 text-sm font-bold text-n-1 underline decoration-2 underline-offset-4"
                        >
                            {expanded ? t('showLess') : t('showMore', { count: overflow })}
                            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={17} aria-hidden="true" />
                        </motion.button>
                    )}
                </>
            )}

            {surface === 'app' && (
                <details
                    className={`${recent.length > 0 ? 'mt-5' : ''} rounded-sm border border-n-1 bg-white px-4`}
                    data-testid="room-link-recovery"
                >
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-h7 [&::-webkit-details-marker]:hidden">
                        <span>{t('recovery.title')}</span>
                        <Icon name="chevron-down" size={18} className="shrink-0" aria-hidden="true" />
                    </summary>
                    <form
                        onSubmit={recover}
                        className="flex flex-col gap-3 border-t border-dashed border-n-1 pb-4 pt-4"
                    >
                        <label className="text-sm font-bold" htmlFor="recover-room-link">
                            {t('recovery.label')}
                        </label>
                        <BaseInput
                            id="recover-room-link"
                            value={pastedLink}
                            onChange={(event) => {
                                setPastedLink(event.target.value)
                                setRecoveryError(null)
                            }}
                            placeholder={t('recovery.placeholder')}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={recoveryError ? 'true' : undefined}
                            aria-describedby={recoveryError ? 'recover-room-error' : 'recover-room-hint'}
                            data-testid="recover-room-input"
                        />
                        <p id="recover-room-hint" className="text-sm leading-5 text-grey-1">
                            {t('recovery.hint')}
                        </p>
                        {recoveryError && (
                            <p id="recover-room-error" role="alert" className="text-sm font-bold text-error">
                                {recoveryError}
                            </p>
                        )}
                        <Button
                            type="submit"
                            variant="stroke"
                            size="medium"
                            loading={recovering}
                            disabled={!pastedLink.trim() || recovering}
                            className="justify-center"
                            data-testid="recover-room-submit"
                        >
                            {t('recovery.submit')}
                        </Button>
                    </form>
                </details>
            )}

            {/* Removing a room is the one irreversible thing this page can do:
                without the link, a room dropped here cannot be reached again from
                this device. So it asks, and it says what the cost is. */}
            <Drawer open={pendingForget !== null} onOpenChange={(next) => !next && closeForget()}>
                {forgetSubject && (
                    <DrawerContent data-testid="forget-room-confirm">
                        <DrawerHeader className="flex flex-row items-end justify-between">
                            <DrawerTitle className="text-h5">
                                {t('confirmForgetTitle', { room: forgetSubject.name })}
                            </DrawerTitle>
                            <CloseButton
                                onClick={closeForget}
                                label={t('confirmForgetClose')}
                                data-testid="close-forget-room"
                            />
                        </DrawerHeader>
                        <DrawerBody>
                            <p id="forget-room-warning" className="text-sm leading-5 text-grey-1">
                                {t('confirmForgetBody')}
                            </p>
                            {forgetError && (
                                <p id="forget-room-error" role="alert" className="text-sm font-bold text-error">
                                    {forgetError}
                                </p>
                            )}
                            <DrawerActions>
                                <SlideToConfirm
                                    autoFocus
                                    label={t('slideForget')}
                                    onConfirm={() => forget(forgetSubject)}
                                    onCancel={closeForget}
                                    aria-describedby={['forget-room-warning', forgetError ? 'forget-room-error' : null]
                                        .filter(Boolean)
                                        .join(' ')}
                                    data-testid="confirm-forget-room"
                                />
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    onClick={closeForget}
                                    data-testid="cancel-forget-room"
                                >
                                    {t('confirmForgetKeep')}
                                </Button>
                            </DrawerActions>
                        </DrawerBody>
                    </DrawerContent>
                )}
            </Drawer>

            {notice && (
                <p
                    role="status"
                    className="mt-3 rounded-sm border border-n-1 bg-green-1 px-3 py-2 text-sm leading-5 text-n-1"
                    data-testid="recent-room-notice"
                >
                    {notice}
                </p>
            )}
        </motion.section>
    )
}

export default YourRooms
