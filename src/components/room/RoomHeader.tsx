'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import type { ApiRoom } from '@/lib/api-types'
import type { MemberIdentity } from '@/lib/identity'

interface RoomHeaderProps {
    room: ApiRoom
    identity: MemberIdentity | null
    onShare: () => void
    onForgetIdentity: () => void
}

export function RoomHeader({ room, identity, onShare, onForgetIdentity }: RoomHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false)

    return (
        <header className="sticky top-0 z-10 border-b border-n-1 bg-primary-1">
            <div className="flex items-center gap-3 px-4 py-3">
                <Link
                    href="/"
                    aria-label="All rooms"
                    className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    {room.emoji || '🥜'}
                </Link>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-h6">{room.name}</h1>
                    <p className="text-h10 uppercase tracking-wider text-n-1/70">
                        {room.currency}
                        {identity ? ` · you are ${identity.name}` : ''}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onShare}
                    aria-label="Share room link"
                    data-testid="share-room"
                    className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="share" size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Room menu"
                    className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="settings" size={18} />
                </button>
            </div>

            <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
                <DrawerContent className="bg-background">
                    <DrawerHeader>
                        <DrawerTitle className="text-h5">{room.name}</DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-3 px-4 pb-8">
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
                        <p className="pt-2 text-center text-sm text-grey-1">
                            Free forever, no signup. Room links are unlisted — only people you send it to can open it.
                        </p>
                    </div>
                </DrawerContent>
            </Drawer>
        </header>
    )
}
