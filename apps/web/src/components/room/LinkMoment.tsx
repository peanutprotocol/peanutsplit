'use client'
import { RoomEmblem } from './RoomEmblem'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { track, roomProps } from '@/lib/analytics'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

interface LinkMomentProps {
    slug: string
    roomName: string
    emoji: string | null
    /** Rendered under the buttons — "Go to room" after creation, nothing in the share drawer. */
    footer?: React.ReactNode
    /** Headline. The creation screen and the share drawer say different things. */
    title: string
    subtitle: string
}

export const roomUrl = (slug: string): string =>
    typeof window === 'undefined'
        ? `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/r/${slug}`
        : `${window.location.origin}/r/${slug}`

/**
 * Signature moment #1 — being handed something.
 *
 * The link is the product, so it gets the ticket treatment: a punched card with
 * the room's face on it, the URL big enough to read across a table, one-tap copy
 * and native share.
 *
 * Clipboard failures are NEVER swallowed (the known bug in the reference UI):
 * if `navigator.clipboard` is missing or rejects, the link switches to a
 * pre-selected input with an explicit "select and copy" instruction.
 */
export function LinkMoment({ slug, roomName, emoji, footer, title, subtitle }: LinkMomentProps) {
    const t = useTranslations('room.link')
    const url = roomUrl(slug)
    const [copied, setCopied] = useState(false)
    const [copyFailed, setCopyFailed] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()

    const revealFallback = useCallback(() => {
        setCopyFailed(true)
        // Give them the next best thing: the link, selected, ready for ⌘C.
        requestAnimationFrame(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        })
    }, [])

    const copy = useCallback(async () => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setCopyFailed(false)
            // Whoosh, not tick: the link just left the card and went somewhere.
            // A tick would say "registered"; this has to say "gone".
            feedback('whoosh')
            track('link_copied', roomProps(slug))
            window.setTimeout(() => setCopied(false), 2_000)
        } catch {
            revealFallback()
        }
    }, [url, slug, revealFallback, feedback])

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
        try {
            await navigator.share({
                // Localised on purpose: this text is pasted straight into the group chat by the
                // person sharing, so it should be in the language they are already speaking.
                title: t('shareTitle', { room: roomName }),
                text: t('shareText', { room: roomName }),
                url,
            })
            track('share_completed', roomProps(slug))
        } catch {
            // AbortError just means they closed the sheet. Nothing to say.
        }
    }, [copy, roomName, url, slug, feedback, t])

    return (
        <div className="flex flex-col gap-6">
            <motion.div
                initial={!motionAllowed ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                className="flex flex-col gap-2 text-center"
            >
                <h1 className="text-h4">{title}</h1>
                <p className="text-sm text-grey-1">{subtitle}</p>
            </motion.div>

            {/* Being handed something: the ticket drops in from above, overshoots,
                and settles a hair off-square before straightening — the way a card
                actually lands on a table. */}
            <motion.div
                initial={!motionAllowed ? false : { y: -56, opacity: 0, rotate: -4, scale: 0.94 }}
                animate={{ y: 0, opacity: 1, rotate: [-4, 1.4, 0], scale: 1 }}
                transition={{
                    default: { type: 'spring', stiffness: 300, damping: 17, mass: 0.9, delay: 0.06 },
                    rotate: { duration: 0.62, delay: 0.06, times: [0, 0.55, 1], ease: 'easeOut' },
                }}
            >
                <Card shadowSize="6" className="overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-n-1 bg-primary-1 px-4 py-4">
                        <motion.span
                            initial={!motionAllowed ? false : { scale: 0.4, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.28 }}
                            className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h4"
                        >
                            <RoomEmblem value={emoji} size={30} />
                        </motion.span>
                        <div className="min-w-0">
                            <p className="truncate text-h6">{roomName}</p>
                            <p className="text-h10 uppercase tracking-wide text-n-1/70">{t('subtitle')}</p>
                        </div>
                    </div>

                    {/* The perforation — this is a ticket, and it should read like one. */}
                    <div className="relative h-0">
                        <span className="absolute -left-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                        <span className="absolute -right-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                        <span className="absolute inset-x-4 -top-px block border-t border-dashed border-n-1/40" />
                    </div>

                    <div className="flex flex-col gap-3 px-4 py-5">
                        <p className="text-h10 uppercase tracking-wide text-grey-1">{t('roomLink')}</p>
                        {copyFailed ? (
                            <div className="flex flex-col gap-2">
                                <input
                                    ref={inputRef}
                                    readOnly
                                    value={url}
                                    onFocus={(event) => event.currentTarget.select()}
                                    aria-label={t('roomLink')}
                                    data-testid="room-link-input"
                                    className="input h-12 select-text px-3 text-sm"
                                />
                                <p className="text-sm text-error">{t('copyBlocked')}</p>
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
                                    className="flex size-9 shrink-0 items-center justify-center rounded-sm transition-transform active:translate-y-px"
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
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={share}
                    icon="share"
                    className="justify-center"
                    data-testid="share-link"
                >
                    {t('share')}
                </Button>
                {footer}
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-grey-1">
                <Icon name="users" size={16} />
                {t('anyoneCanJoin')}
            </p>
        </div>
    )
}
