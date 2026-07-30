'use client'
import { RoomEmblem } from '@/components/room/RoomEmblem'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { api, isApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { forgetRoom, readRecentRooms, rememberRoom, roomSlugFromLink, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

const COLLAPSED_LIMIT = 5

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
 * "Your rooms" — the only personalisation the landing page has, since there are no accounts.
 * Reads localStorage after mount (never during render, so SSR and hydration agree). The
 * paste-link recovery stays available even when the device has no history.
 */
export function YourRooms() {
    const router = useRouter()
    const t = useTranslations('marketing.rooms')
    const locale = useLocale()
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()
    const [recent, setRecent] = useState<RecentRoom[]>([])
    const [expanded, setExpanded] = useState(false)
    const [pastedLink, setPastedLink] = useState('')
    const [recovering, setRecovering] = useState(false)
    const [recoveryError, setRecoveryError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    /** The room waiting on a confirm. This list is the only copy of the link this
     *  device holds, so dropping a room is not something a mis-tap should do. */
    const [pendingForget, setPendingForget] = useState<RecentRoom | null>(null)
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
        setForgetSubject(room)
        setPendingForget(room)
    }

    useEffect(() => {
        setRecent(readRecentRooms())
    }, [])

    // Hiding a single sixth room behind a passive "and 1 more" footer made the
    // list look truncated by accident. Six is still a compact history, so show
    // it outright; larger histories get an explicit reveal control.
    const collapsedLimit = recent.length === COLLAPSED_LIMIT + 1 ? recent.length : COLLAPSED_LIMIT
    const visible = expanded ? recent : recent.slice(0, collapsedLimit)
    const overflow = recent.length - visible.length
    const canCollapse = recent.length > collapsedLimit

    const forget = (room: RecentRoom) => {
        setPendingForget(null)
        if (!forgetRoom(room.slug)) {
            setNotice(t('forgetFailed', { room: room.name }))
            feedback('error', { haptic: 'error' })
            return
        }
        setRecent((current) => current.filter((candidate) => candidate.slug !== room.slug))
        setNotice(t('forgotten', { room: room.name }))
        feedback('tick')
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
        <motion.section
            initial={motionAllowed ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-motion-surface
            data-testid="recent-rooms"
            className="mx-auto w-full max-w-xl px-5 py-8 sm:py-10"
        >
            {recent.length > 0 && (
                <>
                    <div className="flex items-baseline justify-between gap-4">
                        <h2 className="text-h5">{t('title')}</h2>
                        <span className="text-right text-sm text-grey-1">{t('subtitle')}</span>
                    </div>

                    <ul id="recent-room-list" data-testid="recent-room-list" className="mt-4 flex flex-col gap-3">
                        {visible.map((room, index) => (
                            <motion.li
                                key={room.slug}
                                initial={motionAllowed ? { opacity: 0, y: 8 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={
                                    motionAllowed
                                        ? {
                                              type: 'spring',
                                              stiffness: 340,
                                              damping: 30,
                                              delay: 0.05 + index * 0.05,
                                          }
                                        : { duration: 0 }
                                }
                                data-motion-surface
                                className="shadow-4 flex overflow-hidden rounded-sm border border-n-1 bg-white"
                            >
                                <Link
                                    href={`/r/${room.slug}`}
                                    onClick={() => feedback('whoosh')}
                                    aria-label={`${t('openLabel')}: ${room.name}`}
                                    className="flex min-w-0 flex-1 items-center gap-3 p-3 transition-colors hover:bg-primary-4/20"
                                >
                                    {/* The tile wears the room's own palette. Eight rooms rendered in
                                        one lavender square are eight identical rows you have to READ;
                                        the colour is the thing you actually recognise, and it is the
                                        same colour the room's header will be a tap later. Lavender
                                        stays the literal fallback, so an unthemed room is unchanged. */}
                                    <span
                                        aria-hidden="true"
                                        style={room.theme ? { backgroundColor: themeFor(room.theme).field } : undefined}
                                        className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-3 text-h5"
                                    >
                                        <RoomEmblem value={room.emoji} size={30} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-h7">{room.name}</span>
                                        <span className="block text-sm text-grey-1">
                                            {relativeTime(room.lastSeenAt, locale)}
                                        </span>
                                    </span>
                                    <Icon name="chevron-right" size={20} className="shrink-0 text-n-1" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => askForget(room)}
                                    aria-label={t('forgetLabel', { room: room.name })}
                                    data-testid="forget-room"
                                    data-room={room.slug}
                                    className="flex min-w-12 shrink-0 items-center justify-center border-l border-n-1 text-grey-1 transition-colors hover:bg-primary-4/30 hover:text-n-1"
                                >
                                    <Icon name="trash" size={19} aria-hidden="true" />
                                </button>
                            </motion.li>
                        ))}
                    </ul>

                    {canCollapse && (
                        <button
                            type="button"
                            onClick={() => {
                                setExpanded((current) => !current)
                                feedback('blip')
                            }}
                            aria-expanded={expanded}
                            aria-controls="recent-room-list"
                            data-testid="more-rooms"
                            className="rounded-xs mt-4 inline-flex min-h-11 items-center gap-1.5 px-1 py-1 text-sm font-bold text-n-1 underline decoration-2 underline-offset-4 transition-transform active:translate-y-px"
                        >
                            {expanded ? t('showLess') : t('showMore', { count: overflow })}
                            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={17} aria-hidden="true" />
                        </button>
                    )}
                </>
            )}

            <details
                className={`${recent.length > 0 ? 'mt-5' : ''} rounded-sm border border-n-1 bg-white px-4`}
                data-testid="room-link-recovery"
            >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-h7 [&::-webkit-details-marker]:hidden">
                    <span>{t('recovery.title')}</span>
                    <Icon name="chevron-down" size={18} className="shrink-0" aria-hidden="true" />
                </summary>
                <form onSubmit={recover} className="flex flex-col gap-3 border-t border-dashed border-n-1 pb-4 pt-4">
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

            {/* Removing a room is the one irreversible thing this page can do:
                without the link, a room dropped here cannot be reached again from
                this device. So it asks, and it says what the cost is. */}
            <Drawer open={pendingForget !== null} onOpenChange={(next) => !next && setPendingForget(null)}>
                {forgetSubject && (
                    <DrawerContent className={drawerContentClass} data-testid="forget-room-confirm">
                        <DrawerHeader className={cn(drawerHeaderClass, 'flex flex-row items-end justify-between')}>
                            <DrawerTitle className="text-h5">
                                {t('confirmForgetTitle', { room: forgetSubject.name })}
                            </DrawerTitle>
                            <CloseButton
                                onClick={() => setPendingForget(null)}
                                label={t('confirmForgetClose')}
                                data-testid="close-forget-room"
                            />
                        </DrawerHeader>
                        <DrawerBody>
                            <p className="text-sm leading-5 text-grey-1">{t('confirmForgetBody')}</p>
                            <DrawerActions>
                                {/* Both buttons are `stroke`, as in the expense drawer's delete
                                    confirm: the pink CTA is what the page uses to invite an
                                    action, and removing a room is not one this page wants. */}
                                <Button
                                    variant="stroke"
                                    icon="trash"
                                    className="justify-center"
                                    onClick={() => forget(forgetSubject)}
                                    data-testid="confirm-forget-room"
                                >
                                    {t('confirmForget')}
                                </Button>
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    onClick={() => setPendingForget(null)}
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
