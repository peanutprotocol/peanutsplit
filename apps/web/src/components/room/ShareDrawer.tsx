'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import type { ShareSurface } from '@/lib/analytics'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { useFeedback } from '@/lib/use-settings'
import { LinkMoment } from './LinkMoment'
import { Money } from './Money'

interface ShareDrawerProps {
    open: boolean
    onClose: (completed: boolean) => void
    onCompleted?: (method: 'native' | 'clipboard') => void
    state: RoomState
    currencies: readonly CurrencyInfo[]
    surface: ShareSurface
    /** Stable fallback when a post-aha drawer replaced an opener that unmounted. */
    returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The room's focused share moment. Roster editing lives in the creation
 * checkpoint and room settings, so this sheet has one job and one primary
 * action: get the room link into the group chat.
 */
export function ShareDrawer({
    open,
    onClose,
    onCompleted,
    state,
    currencies,
    surface,
    returnFocusRef,
}: ShareDrawerProps) {
    const t = useTranslations('room.share')
    const feedback = useFeedback()
    const room = state.room
    const transfer = surface === 'post_aha' ? state.suggestedTransfers[0] : undefined
    const from = transfer ? state.members.find((member) => member.id === transfer.fromId) : undefined
    const to = transfer ? state.members.find((member) => member.id === transfer.toId) : undefined
    const [completed, setCompleted] = useState(false)
    const completedRef = useRef(false)
    // `onClose` resets the parent surface before the closing animation ends.
    // Preserve the surface this presentation opened with so only a post-aha
    // replacement overrides the generic Drawer's connected opener.
    const openedSurfaceRef = useRef<ShareSurface>(surface)

    const close = useCallback(() => onClose(completedRef.current), [onClose])
    const shared = useCallback(
        (method: 'native' | 'clipboard') => {
            completedRef.current = true
            setCompleted(true)
            onCompleted?.(method)
        },
        [onCompleted]
    )

    useEffect(() => {
        if (open) {
            openedSurfaceRef.current = surface
            completedRef.current = false
            setCompleted(false)
            feedback('blip')
        }
        // The feedback function is stable; rerunning because its provider
        // rendered would replay an opening cue that did not happen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    return (
        <Drawer open={open} onOpenChange={(next) => !next && close()}>
            <DrawerContent
                onCloseAutoFocus={
                    returnFocusRef && openedSurfaceRef.current === 'post_aha'
                        ? (event) => {
                              event.preventDefault()
                              window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }))
                          }
                        : undefined
                }
            >
                <DrawerTitle className="sr-only">{surface === 'post_aha' ? t('postAhaTitle') : t('title')}</DrawerTitle>
                <DrawerBody className="relative gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                    {surface !== 'post_aha' && (
                        <div className="absolute right-4 top-2 z-10">
                            <CloseButton onClick={close} label={t('close')} data-testid="close-share" />
                        </div>
                    )}
                    <LinkMoment
                        slug={room.slug}
                        roomName={room.name}
                        emoji={room.emoji}
                        theme={room.theme}
                        surface={surface}
                        compact={surface === 'post_aha'}
                        dense
                        showQr={surface !== 'post_aha'}
                        title={surface === 'post_aha' ? t('postAhaTitle') : t('title')}
                        subtitle={surface === 'post_aha' ? t('postAhaSubtitle') : t('subtitle')}
                        onCompleted={shared}
                        context={
                            transfer && from && to ? (
                                <div
                                    className="flex items-center justify-between gap-3 rounded-sm border border-n-1 bg-green-1 px-4 py-3"
                                    data-testid="first-balance-context"
                                >
                                    <span className="min-w-0 flex-1 break-words text-h7">
                                        {t('postAhaBalance', { from: from.name, to: to.name })}
                                    </span>
                                    <Money
                                        minor={transfer.amountMinor}
                                        currency={room.currency}
                                        catalog={currencies}
                                        className="shrink-0 text-h6"
                                    />
                                </div>
                            ) : undefined
                        }
                        footer={
                            surface === 'post_aha' ? (
                                <Button
                                    variant="transparent"
                                    className="justify-center"
                                    onClick={close}
                                    data-testid={completed ? 'finish-post-aha-share' : 'skip-post-aha-share'}
                                >
                                    {completed ? t('done') : t('notNow')}
                                </Button>
                            ) : undefined
                        }
                        headingLevel={2}
                    />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
