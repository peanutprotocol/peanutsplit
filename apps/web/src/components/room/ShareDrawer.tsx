'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass } from '@/components/ui/DrawerLayout'
import type { ShareSurface } from '@/lib/analytics'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { useFeedback } from '@/lib/use-settings'
import { LinkMoment } from './LinkMoment'
import { Money } from './Money'

interface ShareDrawerProps {
    open: boolean
    onClose: () => void
    state: RoomState
    currencies: readonly CurrencyInfo[]
    /** The current device's roster id after RoomScreen verified it still exists. */
    sharerMemberId?: string
    surface: ShareSurface
}

/**
 * The room's focused share moment. Roster editing lives in the creation
 * checkpoint and room settings, so this sheet has one job and one primary
 * action: get the room link into the group chat.
 */
export function ShareDrawer({ open, onClose, state, currencies, sharerMemberId, surface }: ShareDrawerProps) {
    const t = useTranslations('room.share')
    const feedback = useFeedback()
    const room = state.room
    const transfer = surface === 'post_aha' ? state.suggestedTransfers[0] : undefined
    const from = transfer ? state.members.find((member) => member.id === transfer.fromId) : undefined
    const to = transfer ? state.members.find((member) => member.id === transfer.toId) : undefined

    useEffect(() => {
        if (open) feedback('blip')
        // The feedback function is stable; rerunning because its provider
        // rendered would replay an opening cue that did not happen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className={drawerContentClass}>
                <DrawerTitle className="sr-only">{surface === 'post_aha' ? t('postAhaTitle') : t('title')}</DrawerTitle>
                <DrawerBody>
                    {surface !== 'post_aha' && (
                        <div className="flex justify-end">
                            <CloseButton onClick={onClose} label={t('close')} data-testid="close-share" />
                        </div>
                    )}
                    <LinkMoment
                        slug={room.slug}
                        roomName={room.name}
                        emoji={room.emoji}
                        theme={room.theme}
                        sharerMemberId={sharerMemberId}
                        surface={surface}
                        compact={surface === 'post_aha'}
                        title={surface === 'post_aha' ? t('postAhaTitle') : t('title')}
                        subtitle={surface === 'post_aha' ? t('postAhaSubtitle') : t('subtitle')}
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
                                    onClick={onClose}
                                    data-testid="skip-post-aha-share"
                                >
                                    {t('notNow')}
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
