'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'
import type { ApiMember, RoomState } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import { activeMembers } from '@/lib/members'
import { useDeleteMember } from '@/lib/queries'
import { forgetIdentity, forgetRoomFromDevice } from '@/lib/use-identity'
import { RemoveRoomSheet } from './RemoveRoomSheet'

export function RoomMembershipActions({
    state,
    identity,
    me,
}: {
    state: RoomState
    identity: MemberIdentity | null
    me: ApiMember | null
}) {
    const t = useTranslations('room.membership')
    const tRooms = useTranslations('marketing.rooms')
    const errorMessage = useErrorMessage()
    const removeMember = useDeleteMember(state.room.slug, identity?.token)
    const [leaveOpen, setLeaveOpen] = useState(false)
    const [removeOpen, setRemoveOpen] = useState(false)
    const [leaveError, setLeaveError] = useState<string | null>(null)
    const [removeError, setRemoveError] = useState<string | null>(null)
    const reasonId = useId()
    const lastActive = activeMembers(state.members).length <= 1
    const hasBalance = me != null && BigInt(state.balances[me.id] ?? '0') !== 0n
    const canLeave = me?.canRemove === true && !hasBalance && !lastActive

    const openRemove = () => {
        setLeaveOpen(false)
        setRemoveError(null)
        setRemoveOpen(true)
    }

    const removeFromDevice = () => {
        if (!forgetRoomFromDevice(state.room.slug)) {
            setRemoveError(tRooms('forgetFailed', { room: state.room.name }))
            return false
        }
        // Leave the mounted room before its next refresh can save it again.
        window.location.replace('/app?manage=1')
        return true
    }

    const leave = async () => {
        if (!me || !canLeave || removeMember.isPending) return false
        setLeaveError(null)
        try {
            await removeMember.mutateAsync(me.id)
            forgetIdentity(state.room.slug, identity)
            window.location.replace('/app?manage=1')
            return true
        } catch (error) {
            const message = errorMessage(error, t('leaveFailed'))
            setLeaveError(message)
            toast.error(message)
            return false
        }
    }

    return (
        <>
            {me && (
                <SettingRow
                    label={t('leave')}
                    testId="leave-room"
                    onClick={() => {
                        setLeaveError(null)
                        setLeaveOpen(true)
                    }}
                />
            )}
            <SettingRow label={tRooms('confirmForget')} testId="remove-room-from-device" onClick={openRemove} />

            <RemoveRoomSheet
                open={removeOpen}
                roomName={state.room.name}
                error={removeError}
                onClose={() => setRemoveOpen(false)}
                onConfirm={removeFromDevice}
            />

            <Drawer open={leaveOpen} onOpenChange={(next) => !removeMember.isPending && setLeaveOpen(next)}>
                <DrawerContent data-testid="leave-room-sheet">
                    <DrawerHeader className="flex flex-row items-end justify-between">
                        <DrawerTitle className="text-h5">{t('leaveTitle', { room: state.room.name })}</DrawerTitle>
                        <CloseButton
                            label={t('cancel')}
                            onClick={() => !removeMember.isPending && setLeaveOpen(false)}
                        />
                    </DrawerHeader>
                    <DrawerBody>
                        <p id={reasonId} className="text-sm leading-5 text-grey-1">
                            {canLeave ? t('leaveBody') : lastActive ? t('lastActive') : t('balanceOpen')}
                        </p>
                        {leaveError && (
                            <p role="alert" className="text-sm font-bold text-error">
                                {leaveError}
                            </p>
                        )}
                        <DrawerActions>
                            {canLeave ? (
                                <SlideToConfirm
                                    autoFocus
                                    label={t('slideLeave')}
                                    onConfirm={leave}
                                    loading={removeMember.isPending}
                                    aria-describedby={reasonId}
                                    onCancel={() => !removeMember.isPending && setLeaveOpen(false)}
                                    data-testid="confirm-leave-room"
                                />
                            ) : (
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    onClick={openRemove}
                                    data-testid="leave-remove-instead"
                                >
                                    {tRooms('confirmForget')}
                                </Button>
                            )}
                            <Button
                                variant="stroke"
                                className="justify-center"
                                disabled={removeMember.isPending}
                                onClick={() => setLeaveOpen(false)}
                                data-testid="cancel-leave-room"
                            >
                                {t('cancel')}
                            </Button>
                        </DrawerActions>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}
