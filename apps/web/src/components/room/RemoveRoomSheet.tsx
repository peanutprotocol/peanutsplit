'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'

export function RemoveRoomSheet({
    open,
    roomName,
    error,
    onClose,
    onConfirm,
}: {
    open: boolean
    roomName: string
    error: string | null
    onClose: () => void
    onConfirm: () => boolean
}) {
    const t = useTranslations('marketing.rooms')
    const warningId = useId()
    const errorId = useId()

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent data-testid="forget-room-confirm">
                <DrawerHeader className="flex flex-row items-end justify-between">
                    <DrawerTitle className="text-h5">{t('confirmForgetTitle', { room: roomName })}</DrawerTitle>
                    <CloseButton onClick={onClose} label={t('confirmForgetClose')} data-testid="close-forget-room" />
                </DrawerHeader>
                <DrawerBody>
                    <p id={warningId} className="text-sm leading-5 text-grey-1">
                        {t('confirmForgetBody')}
                    </p>
                    {error && (
                        <p id={errorId} role="alert" className="text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                    <DrawerActions>
                        <SlideToConfirm
                            autoFocus
                            label={t('slideForget')}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                            aria-describedby={[warningId, error ? errorId : null].filter(Boolean).join(' ')}
                            data-testid="confirm-forget-room"
                        />
                        <Button
                            variant="stroke"
                            className="justify-center"
                            onClick={onClose}
                            data-testid="cancel-forget-room"
                        >
                            {t('confirmForgetKeep')}
                        </Button>
                    </DrawerActions>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
