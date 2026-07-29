'use client'
import { RoomEmblem } from './RoomEmblem'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { AvatarPicker } from '@/components/room/AvatarPicker'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { ThemePicker } from '@/components/room/ThemePicker'
import { PushOptIn } from '@/components/pwa/PushOptIn'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { roomProps, track } from '@/lib/analytics'
import type { ApiMember, ApiRoom } from '@/lib/api-types'
import { avatarFamily } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import { useSetAvatar, useSetTheme } from '@/lib/queries'
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
    const setTheme = useSetTheme(room.slug)
    const tAvatar = useTranslations('room.avatar')
    const [avatarMemberId, setAvatarMemberId] = useState<string | null>(null)
    // Start on the person holding the phone, then remember whoever the table is
    // currently casting. The fallback also covers a member disappearing while
    // this drawer is open.
    const avatarMember = members.find((member) => member.id === avatarMemberId) ?? me ?? members[0] ?? null
    const setAvatar = useSetAvatar(room.slug, avatarMember?.id ?? '')

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
                <Link
                    href="/"
                    aria-label={t('allRooms')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    <RoomEmblem value={room.emoji} size={26} />
                </Link>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-h6">{room.name}</h1>
                    {/* Your own persona opens the shared cast drawer. It is a small
                        social cue in the header without adding a fourth 44px action
                        that would crush the room name on a phone. */}
                    {me ? (
                        <button
                            type="button"
                            onClick={() => setMenuOpen(true)}
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

                <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    aria-label={t('roomMenu')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="settings" size={18} />
                </button>
            </div>

            <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
                <DrawerContent className={drawerContentClass}>
                    <DrawerHeader className={drawerHeaderClass}>
                        <DrawerTitle className="text-h5">{room.name}</DrawerTitle>
                    </DrawerHeader>
                    <DrawerBody>
                        <Button
                            variant="stroke"
                            className="justify-center"
                            icon="link"
                            onClick={() => {
                                setMenuOpen(false)
                                onShare()
                            }}
                        >
                            {t('shareTheRoomLink')}
                        </Button>
                        {/* A cast, not a profile editor. The room chooses a member,
                            then flicks through their alter egos together. This is
                            intentionally as permissive as the shared roster. */}
                        {avatarMember && (
                            <section className="flex flex-col gap-3">
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
                                                member.id === avatarMember.id ? 'shadow-4 bg-primary-1' : 'bg-white'
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
                            </section>
                        )}

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
                                    // Confirm in the medium being switched on. Fired
                                    // directly rather than through `useFeedback`, whose
                                    // gate still holds the pre-toggle value this render.
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

                        {/* The palette is a property of the ROOM, not of this device —
                            unlike everything above it in this drawer. It sits here anyway
                            because this is where a room's own settings live, and the copy
                            says who else sees it. */}
                        <ThemePicker value={room.theme} onChange={chooseTheme} disabled={setTheme.isPending} />

                        {/* Per room and per device, which is why it lives in the room's own
                            drawer rather than anywhere global. Renders nothing on a browser
                            that cannot do push at all. */}
                        <PushOptIn slug={room.slug} identity={identity} />

                        {/* The room drawer is the only place a language can be changed inside
                            the product — the landing footer is the other, and a room is where
                            someone actually notices they are reading the wrong one. */}
                        <LocaleSwitcher label={tLocale('label')} />

                        {/* Last, under everything.
                            This drops the identity this device is holding — the single
                            most destructive thing in the drawer — and it used to sit
                            second from the top, one row under "share the link", where a
                            thumb reaching for share finds it. It is also not a setting:
                            it answers a question ("someone else is using this phone?")
                            that occurs to about one person in a hundred, so it belongs
                            where you look when nothing above it was what you wanted. */}
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

                        <p className="text-center text-sm text-grey-1">{t('privacyNote')}</p>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </header>
    )
}
