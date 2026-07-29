'use client'
import { RoomEmblem } from './RoomEmblem'

import { useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { AvatarPicker } from '@/components/room/AvatarPicker'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { ThemePicker } from '@/components/room/ThemePicker'
import { PushOptIn } from '@/components/pwa/PushOptIn'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { roomProps, track } from '@/lib/analytics'
import { isApiError } from '@/lib/api'
import type { ApiMember, ApiRoom } from '@/lib/api-types'
import { avatarFamily } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import { useAddMember, useSetAvatar, useSetRoomName, useSetTheme } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { triggerHaptic, useFeedback, useSettings } from '@/lib/use-settings'

interface RoomHeaderProps {
    room: ApiRoom
    members: ApiMember[]
    identity: MemberIdentity | null
    /** The roster row for `identity`, when this device is one of the members.
     *  Null while the room is still loading or when nobody has joined here. */
    me: ApiMember | null
    onShare: () => void
    onForgetIdentity: () => void
}

/**
 * A hard-edged switch rather than an iOS toggle — the whole design system is
 * 1px borders and black shadows, and a rounded pill would be the only soft thing
 * on the screen. On = filled yellow with a check, exactly like the participant
 * checkboxes in the expense drawer.
 */
function SettingToggle({
    label,
    hint,
    checked,
    onChange,
    testId,
}: {
    label: string
    hint: string
    checked: boolean
    onChange: (next: boolean) => void
    /**
     * Passed in rather than derived from `label`. The test id used to be
     * `setting-${label.toLowerCase()}`, which meant translating "Sound" renamed the hook the e2e
     * suite selects on — a locale change would have silently broken the tests.
     */
    testId: string
}) {
    const motionAllowed = useMotionAllowed()

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            data-testid={testId}
            className="flex min-h-11 w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]"
        >
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{label}</span>
                <span className="block text-sm text-grey-1">{hint}</span>
            </span>
            <motion.span
                animate={{ backgroundColor: checked ? '#FFC900' : '#FFFFFF' }}
                transition={motionAllowed ? { duration: 0.15 } : { duration: 0 }}
                data-motion-surface
                className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-n-1"
            >
                {checked && <Icon name="check" size={16} />}
            </motion.span>
        </button>
    )
}

export function RoomHeader({ room, members, identity, me, onShare, onForgetIdentity }: RoomHeaderProps) {
    const t = useTranslations('room.header')
    const tLocale = useTranslations('locale')
    const [menuOpen, setMenuOpen] = useState(false)
    const { settings, setSoundEnabled, setHapticsEnabled, setAnimationsEnabled } = useSettings()
    const tSettings = useTranslations('settings')
    const tTheme = useTranslations('room.theme')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const addMember = useAddMember(room.slug)
    const setRoomName = useSetRoomName(room.slug)
    const setTheme = useSetTheme(room.slug)
    const tAvatar = useTranslations('room.avatar')
    const [avatarMemberId, setAvatarMemberId] = useState<string | null>(null)
    const [roomName, setRoomNameDraft] = useState(room.name)
    const [roomNameError, setRoomNameError] = useState<string | null>(null)
    const [personName, setPersonName] = useState('')
    const [personError, setPersonError] = useState<string | null>(null)
    // Start on the person holding the phone, then remember whoever the table is
    // currently casting. The fallback also covers a member disappearing while
    // this drawer is open.
    const avatarMember = members.find((member) => member.id === avatarMemberId) ?? me ?? members[0] ?? null
    const setAvatar = useSetAvatar(room.slug, avatarMember?.id ?? '')

    const openSettings = () => {
        setRoomNameDraft(room.name)
        setRoomNameError(null)
        setPersonError(null)
        setMenuOpen(true)
    }

    const renameRoom = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = roomName.trim()
        if (!name || name === room.name || setRoomName.isPending) return
        setRoomNameError(null)
        try {
            await setRoomName.mutateAsync(name)
            setRoomNameDraft(name)
            feedback('pop')
        } catch (error) {
            feedback('error', { haptic: 'error' })
            setRoomNameError(errorMessage(error, t('nameFailed')))
        }
    }

    const addPerson = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = personName.trim()
        if (!name || addMember.isPending) return
        const existing = members.find((member) => member.name.toLowerCase() === name.toLowerCase())
        if (existing) {
            setPersonError(t('personDuplicate', { name }))
            return
        }
        setPersonError(null)
        try {
            const next = await addMember.mutateAsync({ name })
            setAvatarMemberId(next.memberId)
            setPersonName('')
            feedback('pop')
        } catch (error) {
            feedback('error', { haptic: 'error' })
            if (isApiError(error, 'DUPLICATE_MEMBER_NAME')) {
                setPersonError(t('personDuplicate', { name }))
                return
            }
            setPersonError(errorMessage(error, t('personFailed')))
        }
    }

    const chooseAvatar = (avatar: string | null) => {
        if (!avatarMember || avatar === avatarMember.avatar) return
        feedback('tick')
        // The FAMILY, never the key or target member: both are social detail that
        // analytics.ts exists to keep out of a funnel.
        track('avatar_changed', roomProps(room.slug, { family: avatarFamily(avatar) }))
        setAvatar.mutate(avatar, {
            onError: (error) => {
                feedback('error')
                toast.error(errorMessage(error, tAvatar('failed')), { duration: TOAST_MS.actionable })
            },
        })
    }

    const chooseTheme = (theme: string | null) => {
        if (theme === (room.theme ?? null)) return
        feedback('tick')
        track('theme_changed', roomProps(room.slug, { theme: theme ?? 'classic' }))
        setTheme.mutate(theme, {
            onError: (error) => {
                feedback('error')
                toast.error(errorMessage(error, tTheme('failed')), { duration: TOAST_MS.actionable })
            },
        })
    }

    return (
        // The room's field colour, with the classic yellow as the literal
        // fallback — a room with no theme renders the exact bytes it did before
        // this variable existed.
        <header className="sticky top-0 z-10 border-b border-n-1 bg-[var(--split-theme-field,#FFC900)]">
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    type="button"
                    onClick={openSettings}
                    aria-label={t('openSettings')}
                    data-testid="open-room-settings"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    <RoomEmblem value={room.emoji} size={26} />
                </button>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-h6">{room.name}</h1>
                    {/* Your own persona opens the shared cast drawer. It is a small
                        social cue in the header without adding a fourth 44px action
                        that would crush the room name on a phone. */}
                    {me ? (
                        <button
                            type="button"
                            onClick={() => {
                                setAvatarMemberId(me.id)
                                openSettings()
                            }}
                            aria-label={tAvatar('open')}
                            data-testid="open-avatar"
                            className="-my-0.5 flex items-center gap-1.5 py-0.5"
                        >
                            <MemberAvatar name={me.name} avatar={me.avatar} size={16} />
                            <span className="truncate text-h10 uppercase tracking-wide text-n-1/70">
                                {`${room.currency} · ${t('youAre', { name: me.name })}`}
                            </span>
                        </button>
                    ) : (
                        <p className="text-h10 uppercase tracking-wide text-n-1/70">
                            {room.currency}
                            {identity ? ` · ${t('youAre', { name: identity.name })}` : ''}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onShare}
                    aria-label={t('shareRoomLink')}
                    data-testid="share-room"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="share" size={18} />
                </button>
            </div>

            <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
                <DrawerContent className={drawerContentClass} data-testid="room-settings">
                    <DrawerHeader className={drawerHeaderClass}>
                        <DrawerTitle className="text-h5">{t('settingsTitle')}</DrawerTitle>
                    </DrawerHeader>
                    <DrawerBody>
                        <section
                            className="shadow-4 shrink-0 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                            data-testid="room-settings-room-section"
                        >
                            <div className="border-b border-dashed border-grey-1 px-3 py-3">
                                <h2 className="text-h7">{t('roomSection')}</h2>
                                <p className="mt-1 text-sm text-grey-1">{t('roomSectionHint')}</p>
                            </div>
                            <div className="flex flex-col gap-4 p-3">
                                <form onSubmit={renameRoom} className="flex flex-col gap-2">
                                    <label htmlFor="room-display-name" className="text-h8">
                                        {t('displayName')}
                                    </label>
                                    <BaseInput
                                        id="room-display-name"
                                        value={roomName}
                                        onChange={(event) => {
                                            setRoomNameDraft(event.target.value)
                                            setRoomNameError(null)
                                        }}
                                        maxLength={80}
                                        aria-invalid={roomNameError ? true : undefined}
                                        data-testid="room-display-name"
                                    />
                                    <p className="text-sm text-grey-1">{t('displayNameHint')}</p>
                                    {roomNameError && (
                                        <p role="alert" className="text-sm font-bold text-error">
                                            {roomNameError}
                                        </p>
                                    )}
                                    <Button
                                        type="submit"
                                        size="medium"
                                        disabled={!roomName.trim() || roomName.trim() === room.name}
                                        loading={setRoomName.isPending}
                                        className="justify-center"
                                        data-testid="save-room-name"
                                    >
                                        {t('saveName')}
                                    </Button>
                                </form>

                                <div className="border-t border-dashed border-grey-1 pt-4">
                                    <p className="text-h8">{t('roomLink')}</p>
                                    <p className="mt-1 break-all font-mono text-sm text-grey-1">{`/r/${room.slug}`}</p>
                                    <p className="mt-1 text-sm text-grey-1">{t('roomLinkHint')}</p>
                                    <Button
                                        variant="stroke"
                                        size="medium"
                                        className="mt-3 justify-center"
                                        icon="link"
                                        onClick={() => {
                                            setMenuOpen(false)
                                            onShare()
                                        }}
                                    >
                                        {t('shareTheRoomLink')}
                                    </Button>
                                </div>

                                <div className="border-t border-dashed border-grey-1 pt-4">
                                    <ThemePicker
                                        value={room.theme}
                                        onChange={chooseTheme}
                                        disabled={setTheme.isPending}
                                    />
                                </div>
                            </div>
                        </section>

                        <section
                            className="shadow-4 shrink-0 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                            data-testid="room-settings-people-section"
                        >
                            <div className="border-b border-dashed border-grey-1 px-3 py-3">
                                <h2 className="text-h7">{t('peopleSection')}</h2>
                                <p className="mt-1 text-sm text-grey-1">{t('peopleSectionHint')}</p>
                            </div>
                            <div className="flex flex-col gap-4 p-3">
                                <ul className="flex flex-wrap gap-2" data-testid="room-settings-roster">
                                    {members.map((member) => (
                                        <li
                                            key={member.id}
                                            className="flex items-center gap-2 rounded-sm border border-n-1 bg-white py-1 pl-1 pr-3"
                                        >
                                            <MemberAvatar name={member.name} avatar={member.avatar} size={24} />
                                            <span className="max-w-[10rem] truncate text-sm">{member.name}</span>
                                        </li>
                                    ))}
                                </ul>

                                <form onSubmit={addPerson} className="flex items-start gap-2">
                                    <BaseInput
                                        variant="sm"
                                        value={personName}
                                        onChange={(event) => {
                                            setPersonName(event.target.value)
                                            setPersonError(null)
                                        }}
                                        placeholder={t('personNamePlaceholder')}
                                        maxLength={80}
                                        aria-label={t('personNamePlaceholder')}
                                        data-testid="settings-person-name"
                                    />
                                    <Button
                                        type="submit"
                                        variant="stroke"
                                        size="medium"
                                        icon="plus"
                                        disabled={!personName.trim()}
                                        loading={addMember.isPending}
                                        className="w-auto shrink-0 justify-center"
                                        data-testid="settings-add-person"
                                    >
                                        {t('addPerson')}
                                    </Button>
                                </form>
                                {personError && (
                                    <p role="alert" className="text-sm font-bold text-error">
                                        {personError}
                                    </p>
                                )}

                                {/* A cast, not a profile editor. The room chooses a member,
                                    then flicks through their alter egos together. */}
                                {avatarMember && (
                                    <div className="flex flex-col gap-3 border-t border-dashed border-grey-1 pt-4">
                                        <div>
                                            <span className="text-h8 uppercase tracking-wide text-grey-1">
                                                {tAvatar('castTitle')}
                                            </span>
                                            <p className="mt-1 text-sm text-grey-1">{tAvatar('castHint')}</p>
                                        </div>
                                        <div
                                            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                                            aria-label={tAvatar('chooseMember')}
                                        >
                                            {members.map((member) => (
                                                <button
                                                    key={member.id}
                                                    type="button"
                                                    aria-pressed={member.id === avatarMember.id}
                                                    onClick={() => setAvatarMemberId(member.id)}
                                                    data-testid="avatar-member"
                                                    data-member={member.name}
                                                    className={cn(
                                                        'flex shrink-0 items-center gap-2 rounded-sm border border-n-1 px-2.5 py-2 text-sm font-bold transition-transform active:translate-y-px',
                                                        member.id === avatarMember.id
                                                            ? 'shadow-4 bg-primary-1'
                                                            : 'bg-white'
                                                    )}
                                                >
                                                    <MemberAvatar name={member.name} avatar={member.avatar} size={28} />
                                                    {member.name}
                                                </button>
                                            ))}
                                        </div>
                                        <AvatarPicker
                                            name={avatarMember.name}
                                            value={avatarMember.avatar}
                                            onChange={chooseAvatar}
                                            disabled={setAvatar.isPending}
                                        />
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="flex shrink-0 flex-col gap-3" data-testid="room-settings-device-section">
                            <div>
                                <h2 className="text-h7">{t('deviceSection')}</h2>
                                <p className="mt-1 text-sm text-grey-1">{t('deviceSectionHint')}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('feedback')}</span>
                                <SettingToggle
                                    label={t('sound')}
                                    hint={t('soundHint')}
                                    testId="setting-sound"
                                    checked={settings.soundEnabled}
                                    onChange={setSoundEnabled}
                                />
                                <SettingToggle
                                    label={t('haptics')}
                                    hint={t('hapticsHint')}
                                    testId="setting-haptics"
                                    checked={settings.hapticsEnabled}
                                    onChange={(next) => {
                                        setHapticsEnabled(next)
                                        if (next) triggerHaptic(16)
                                    }}
                                />
                                <SettingToggle
                                    label={tSettings('animations.title')}
                                    hint={tSettings('animations.description')}
                                    testId="setting-animations"
                                    checked={settings.animationsEnabled}
                                    onChange={setAnimationsEnabled}
                                />
                            </div>
                            <PushOptIn slug={room.slug} identity={identity} />
                            <LocaleSwitcher label={tLocale('label')} />
                            {identity && (
                                <Button
                                    variant="stroke"
                                    className="justify-center"
                                    icon="users"
                                    onClick={() => {
                                        setMenuOpen(false)
                                        onForgetIdentity()
                                    }}
                                >
                                    {t('notMe')}
                                </Button>
                            )}
                        </section>

                        <p className="text-center text-sm text-grey-1">{t('privacyNote')}</p>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </header>
    )
}
