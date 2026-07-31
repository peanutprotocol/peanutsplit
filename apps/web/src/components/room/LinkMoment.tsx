'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { peanutWavingHello } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { CARD_FILE_NAME, achievementCardPath } from '@/lib/achievements-contract'
import { roomProps, sharePackageMeasureProps, track } from '@/lib/analytics'
import { copyText } from '@/lib/clipboard'
import { roomSharePackage } from '@/lib/share-package'
import { useSharePng } from '@/lib/share-card'
import { themeFor } from '@/lib/themes'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { RoomEmblem } from './RoomEmblem'

interface LinkMomentProps {
    slug: string
    roomName: string
    emoji: string | null
    theme?: string | null
    /** Rendered under the buttons — "Go to room" after creation, nothing in the share drawer. */
    footer?: React.ReactNode
    /** Headline. The creation screen and the share drawer say different things. */
    title: string
    subtitle: string
    /**
     * Rank of the headline. `/new` is the default because there this headline is
     * the page's only one; inside the share drawer the room header already owns
     * the `h1`, and a second one would claim the page is about two things.
     */
    headingLevel?: 1 | 2
}

export const roomUrl = (slug: string): string =>
    typeof window === 'undefined'
        ? `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/r/${slug}`
        : `${window.location.origin}/r/${slug}`

/**
 * The group-chat handoff.
 *
 * The bearer link appears only in user-directed text (native share and
 * clipboard). The visual attachment is the room's own invite card, rendered by
 * the same pipeline every other card goes through; it carries the room name,
 * palette and emblem, and no URL, roster or ledger data.
 *
 * Native share is an enhancement. Clipboard and manual copy remain available
 * independently.
 */
export function LinkMoment({
    slug,
    roomName,
    emoji,
    theme,
    footer,
    title,
    subtitle,
    headingLevel = 1,
}: LinkMomentProps) {
    const t = useTranslations('room.link')
    const Heading = headingLevel === 1 ? 'h1' : 'h2'
    const url = roomUrl(slug)
    const payload = useMemo(
        () =>
            roomSharePackage({
                title: t('shareTitle', { room: roomName }),
                nextAction: t('shareText'),
                url,
            }),
        [roomName, t, url]
    )
    /**
     * Prefetched on mount, never inside the tap: `navigator.share` needs transient user
     * activation and an `await fetch` in the gesture is what loses it on iOS. Both screens that
     * render this are on display for seconds before anyone taps.
     */
    const { file } = useSharePng(achievementCardPath(slug, 'invite'), CARD_FILE_NAME.invite)
    const palette = themeFor(theme)
    const [copied, setCopied] = useState(false)
    const [copyFailed, setCopyFailed] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    /**
     * The wave-off: the mascot peeks over the ticket when the link actually
     * leaves — copy succeeded or the share sheet resolved — never on mount.
     * The whoosh already means "gone"; this is the same sentence, drawn.
     * One wave at a time: a re-tap during the peek is ignored rather than
     * restarted, and the `copied` label's own 2s reset never replays it.
     */
    const [waving, setWaving] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()

    const wave = useCallback(() => {
        if (motionAllowed) setWaving(true)
    }, [motionAllowed])

    useEffect(() => {
        track('share_package_presented', sharePackageMeasureProps())
    }, [])

    const completed = useCallback((method: 'native' | 'clipboard') => {
        track('share_completed', sharePackageMeasureProps(method))
    }, [])

    const revealFallback = useCallback(() => {
        setCopyFailed(true)
        setStatus(t('copyBlocked'))
        requestAnimationFrame(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        })
    }, [t])

    const copy = useCallback(async () => {
        // `copyText` answers with a boolean rather than throwing, so the check
        // mark below cannot appear for a copy that never happened.
        if (!(await copyText(payload.fullText))) {
            feedback('error', { haptic: 'error' })
            revealFallback()
            return
        }
        setCopied(true)
        setCopyFailed(false)
        setStatus(t('copied'))
        feedback('whoosh')
        wave()
        track('link_copied', roomProps(slug))
        completed('clipboard')
        window.setTimeout(() => setCopied(false), 2_000)
    }, [completed, feedback, payload.fullText, revealFallback, slug, t, wave])

    const share = useCallback(async () => {
        // Web Share is mostly a phone feature. Keep Share as the primary action
        // everywhere: on browsers without a native sheet it copies the same link,
        // ready to paste into whatever the group uses.
        if (typeof navigator.share !== 'function') {
            await copy()
            return
        }
        feedback('whoosh')
        track('share_opened', roomProps(slug))
        // Localised on purpose: `roomSharePackage` was built from `t(...)`, so this
        // text is in the language the person sharing is already speaking when it
        // gets pasted into the group chat.
        const textPayload = { title: payload.title, text: payload.text, url: payload.url }
        let nativePayload: ShareData = textPayload
        if (file) {
            try {
                const richPayload = { ...textPayload, files: [file] }
                if (navigator.canShare?.(richPayload)) nativePayload = richPayload
            } catch {
                // `canShare` is an optional enhancement, and so is the card: if the probe throws,
                // or the prefetch has not landed, the text+url package goes out unchanged. The
                // invite's whole job is to carry the link; the picture is the enhancement.
            }
        }

        try {
            await navigator.share(nativePayload)
            setStatus(t('shared'))
            wave()
            // `completed` is the one `share_completed` emitter — it carries the
            // package variant and method, which the bare room props did not.
            completed('native')
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            setStatus(t('shareFailed'))
            feedback('error', { haptic: 'error' })
        }
    }, [completed, copy, feedback, file, payload, slug, t, wave])

    return (
        <div className="flex flex-col gap-6">
            <motion.div
                initial={motionAllowed ? { opacity: 0, y: -8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 340, damping: 30 } : { duration: 0 }}
                data-motion-surface
                className="flex flex-col gap-2 text-center"
            >
                <Heading className="text-h4">{title}</Heading>
                <p className="text-sm text-grey-1">{subtitle}</p>
            </motion.div>

            <motion.div
                // `relative` anchors the mascot's peek; it must stay even when
                // nothing moves, or the absolute child escapes the ticket.
                className="relative"
                initial={motionAllowed ? { y: -56, opacity: 0, rotate: -4, scale: 0.94 } : false}
                animate={{ y: 0, opacity: 1, rotate: motionAllowed ? [-4, 1.4, 0] : 0, scale: 1 }}
                transition={
                    motionAllowed
                        ? {
                              default: {
                                  type: 'spring',
                                  stiffness: 300,
                                  damping: 17,
                                  mass: 0.9,
                                  delay: 0.06,
                              },
                              rotate: { duration: 0.62, delay: 0.06, times: [0, 0.55, 1], ease: 'easeOut' },
                          }
                        : { duration: 0 }
                }
                data-motion-surface
                data-testid="room-share-card"
            >
                {/* Behind the opaque Card (negative z), so only what clears the top
                    edge is ever visible: rises, waves, ducks back down. A genuine
                    peek — zero layout shift, nothing to tap. */}
                {waving && (
                    <motion.div
                        aria-hidden="true"
                        data-decorative
                        className="pointer-events-none absolute right-8 top-0 -z-10"
                        initial={{ y: 48, rotate: 0 }}
                        animate={{ y: [48, -26, -26, 48], rotate: [0, -5, 5, 0] }}
                        transition={{ duration: 1.5, times: [0, 0.22, 0.78, 1], ease: 'easeInOut' }}
                        onAnimationComplete={() => setWaving(false)}
                    >
                        <Image src={peanutWavingHello} alt="" unoptimized className="h-14 w-14 object-contain" />
                    </motion.div>
                )}
                <Card shadowSize="6" className="overflow-hidden">
                    <div
                        className="flex items-center gap-3 border-b border-n-1 px-4 py-4"
                        style={{ backgroundColor: palette.field }}
                    >
                        <motion.span
                            initial={motionAllowed ? { scale: 0.4, rotate: -20 } : false}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={
                                motionAllowed
                                    ? { type: 'spring', stiffness: 400, damping: 14, delay: 0.28 }
                                    : { duration: 0 }
                            }
                            data-motion-surface
                            data-testid="room-share-doodle"
                            className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h4"
                        >
                            <RoomEmblem value={emoji} name={roomName} size={30} />
                        </motion.span>
                        <div className="min-w-0">
                            <p className="truncate text-h6">{roomName}</p>
                            <p className="text-h10 uppercase tracking-wide text-n-1/70">{t('subtitle')}</p>
                        </div>
                    </div>

                    <div className="relative h-0">
                        <span className="absolute -left-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                        <span className="absolute -right-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                        <span className="absolute inset-x-4 -top-px block border-t border-dashed border-n-1/40" />
                    </div>

                    <div className="flex flex-col gap-3 px-4 py-5">
                        <p className="text-h10 uppercase tracking-wide text-grey-1">{t('roomLink')}</p>
                        {copyFailed ? (
                            <div className="flex flex-col gap-2">
                                <textarea
                                    ref={inputRef}
                                    readOnly
                                    value={payload.fullText}
                                    onFocus={(event) => event.currentTarget.select()}
                                    aria-label={t('inviteText')}
                                    data-testid="room-link-input"
                                    rows={3}
                                    className="input min-h-24 select-text px-3 py-3 text-sm"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex min-h-12 items-center gap-2 rounded-sm border border-dashed border-n-1 bg-grey-3 py-1 pl-3 pr-1"
                                data-testid="room-link-row"
                            >
                                <p
                                    data-testid="room-link"
                                    className="min-w-0 flex-1 select-text break-all text-sm font-bold"
                                >
                                    {url}
                                </p>
                                <motion.button
                                    type="button"
                                    onClick={copy}
                                    aria-label={copied ? t('copied') : t('copy')}
                                    data-testid="copy-link"
                                    animate={
                                        copied
                                            ? { scale: [1, 1.08, 1], backgroundColor: '#98E9AB' }
                                            : { scale: 1, backgroundColor: 'rgba(255,255,255,0)' }
                                    }
                                    transition={{ duration: 0.22 }}
                                    className="flex size-10 shrink-0 items-center justify-center rounded-sm transition-transform active:translate-y-px"
                                >
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.span
                                            key={copied ? 'check' : 'copy'}
                                            initial={{ scale: 0.3, rotate: copied ? -120 : 0, opacity: 0 }}
                                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                            exit={{ scale: 0.3, opacity: 0 }}
                                            transition={{ type: 'spring', stiffness: 520, damping: 20 }}
                                            className="flex items-center justify-center"
                                        >
                                            <Icon name={copied ? 'check' : 'copy'} size={15} />
                                        </motion.span>
                                    </AnimatePresence>
                                </motion.button>
                            </div>
                        )}
                    </div>
                </Card>
            </motion.div>

            <div className="flex flex-col gap-3">
                {/* Share stays the single primary action and is never hidden: on a
                    browser with no native sheet `share()` copies instead, so the
                    button always does the useful thing. That answers what an earlier
                    version of this screen solved by promoting Copy and gating Share
                    on `navigator.share` — copy now lives inline in the link row, and
                    one primary action beats two competing ones. */}
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={() => void share()}
                    icon="share"
                    className="justify-center"
                    data-testid="share-link"
                >
                    {t('share')}
                </Button>
                {footer}
            </div>

            {status && (
                <p role="status" className="text-center text-sm font-bold text-grey-1" data-testid="share-status">
                    {status}
                </p>
            )}

            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-grey-1">
                <Icon name="users" size={16} />
                {t('anyoneCanJoin')}
            </p>
        </div>
    )
}
