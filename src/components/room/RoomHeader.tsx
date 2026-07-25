'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import type { ApiRoom } from '@/lib/api-types'
import type { MemberIdentity } from '@/lib/identity'
import { triggerHaptic, useSettings } from '@/lib/use-settings'

interface RoomHeaderProps {
    room: ApiRoom
    identity: MemberIdentity | null
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
}: {
    label: string
    hint: string
    checked: boolean
    onChange: (next: boolean) => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            data-testid={`setting-${label.toLowerCase()}`}
            className="flex min-h-11 w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]"
        >
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{label}</span>
                <span className="block text-sm text-grey-1">{hint}</span>
            </span>
            <motion.span
                animate={{ backgroundColor: checked ? '#FFC900' : '#FFFFFF' }}
                transition={{ duration: 0.15 }}
                className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-n-1"
            >
                {checked && <Icon name="check" size={16} />}
            </motion.span>
        </button>
    )
}

export function RoomHeader({ room, identity, onShare, onForgetIdentity }: RoomHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false)
    const { settings, setSoundEnabled, setHapticsEnabled } = useSettings()

    return (
        <header className="sticky top-0 z-10 border-b border-n-1 bg-primary-1">
            <div className="flex items-center gap-3 px-4 py-3">
                <Link
                    href="/"
                    aria-label="All rooms"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    {room.emoji || '🥜'}
                </Link>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-h6">{room.name}</h1>
                    <p className="text-h10 uppercase tracking-wide text-n-1/70">
                        {room.currency}
                        {identity ? ` · you are ${identity.name}` : ''}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onShare}
                    aria-label="Share room link"
                    data-testid="share-room"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="share" size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Room menu"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="settings" size={18} />
                </button>
            </div>

            <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
                <DrawerContent className="bg-background">
                    <DrawerHeader>
                        <DrawerTitle className="text-h5">{room.name}</DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-3 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
                        <Button
                            variant="stroke"
                            className="justify-center"
                            icon="link"
                            onClick={() => {
                                setMenuOpen(false)
                                onShare()
                            }}
                        >
                            Share the room link
                        </Button>
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
                                {`I'm not ${identity.name}`}
                            </Button>
                        )}

                        <div className="mt-2 flex flex-col gap-2">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">Feedback</span>
                            <SettingToggle
                                label="Sound"
                                hint="Little ticks, thunks and a bell"
                                checked={settings.soundEnabled}
                                onChange={setSoundEnabled}
                            />
                            <SettingToggle
                                label="Haptics"
                                hint="A tap you can feel"
                                checked={settings.hapticsEnabled}
                                onChange={(next) => {
                                    setHapticsEnabled(next)
                                    // Confirm in the medium being switched on. Fired
                                    // directly rather than through `useFeedback`, whose
                                    // gate still holds the pre-toggle value this render.
                                    if (next) triggerHaptic(16)
                                }}
                            />
                        </div>

                        <p className="pt-2 text-center text-sm text-grey-1">
                            Free forever, no signup. Room links are unlisted — only people you send it to can open it.
                        </p>
                    </div>
                </DrawerContent>
            </Drawer>
        </header>
    )
}
