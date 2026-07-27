'use client'

import { Drawer, DrawerContent } from '@/components/ui/Drawer'
import type { ApiRoom } from '@/lib/api-types'
import { LinkMoment } from './LinkMoment'

/** The link moment again, on demand — same artefact, reachable from the header. */
export function ShareDrawer({ open, onClose, room }: { open: boolean; onClose: () => void; room: ApiRoom }) {
    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <div className="px-5 pb-10 pt-2">
                    <LinkMoment
                        slug={room.slug}
                        roomName={room.name}
                        emoji={room.emoji}
                        title="Invite the rest"
                        subtitle="One link. They tap it, pick their name, and they are in."
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}
