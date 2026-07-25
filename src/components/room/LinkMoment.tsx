'use client'

import { useCallback, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { track, roomProps } from '@/lib/analytics'

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
    const url = roomUrl(slug)
    const [copied, setCopied] = useState(false)
    const [copyFailed, setCopyFailed] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

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
            track('link_copied', roomProps(slug))
            window.setTimeout(() => setCopied(false), 2_000)
        } catch {
            revealFallback()
        }
    }, [url, slug, revealFallback])

    const share = useCallback(async () => {
        track('share_opened', roomProps(slug))
        try {
            await navigator.share({
                title: `${roomName} · Peanut Split`,
                text: `Join "${roomName}" and let's split this properly.`,
                url,
            })
            track('share_completed', roomProps(slug))
        } catch {
            // AbortError just means they closed the sheet. Nothing to say.
        }
    }, [roomName, url, slug])

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 text-center">
                <h1 className="text-h4">{title}</h1>
                <p className="text-sm text-grey-1">{subtitle}</p>
            </div>

            <motion.div
                initial={{ y: 24, opacity: 0, rotate: -1.5 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
                <Card shadowSize="6" className="overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-n-1 bg-primary-1 px-4 py-4">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h4">
                            {emoji || '🥜'}
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-h6">{roomName}</p>
                            <p className="text-h10 uppercase tracking-wider text-n-1/70">your split room</p>
                        </div>
                    </div>

                    {/* The perforation — this is a ticket, and it should read like one. */}
                    <div className="relative h-0">
                        <span className="absolute -left-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                        <span className="absolute -right-2 -top-2 size-4 rounded-full border border-n-1 bg-background" />
                    </div>

                    <div className="flex flex-col gap-3 px-4 py-5">
                        <p className="text-h10 uppercase tracking-wider text-grey-1">Room link</p>
                        {copyFailed ? (
                            <div className="flex flex-col gap-2">
                                <input
                                    ref={inputRef}
                                    readOnly
                                    value={url}
                                    onFocus={(event) => event.currentTarget.select()}
                                    aria-label="Room link"
                                    data-testid="room-link-input"
                                    className="input h-12 select-text px-3 text-sm"
                                />
                                <p className="text-sm text-error">
                                    Your browser blocked the copy — select the link above and copy it manually.
                                </p>
                            </div>
                        ) : (
                            <p
                                data-testid="room-link"
                                className="select-text break-all rounded-sm border border-dashed border-n-1 bg-grey-3 px-3 py-3 text-sm font-bold"
                            >
                                {url}
                            </p>
                        )}
                    </div>
                </Card>
            </motion.div>

            <div className="flex flex-col gap-3">
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={copy}
                    icon={copied ? 'check' : 'copy'}
                    className="justify-center"
                    data-testid="copy-link"
                >
                    {copied ? 'Copied!' : 'Copy link'}
                </Button>
                {canShare && (
                    <Button variant="stroke" onClick={share} icon="share" className="justify-center">
                        Share
                    </Button>
                )}
                {footer}
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-grey-1">
                <Icon name="users" size={16} />
                Anyone with this link can join and add expenses.
            </p>
        </div>
    )
}
