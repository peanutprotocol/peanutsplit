'use client'

import { Doodle } from '@/components/ui/Doodle'
import { avatarArt } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { PersonaGlyph } from './PersonaGlyph'

/**
 * A member's little alter ego.
 *
 * Two sources, one component. With no `avatar` a playful persona is derived
 * from the name — same name, same creature, every device. A stored key draws
 * the chosen alter ego or one of the older doodles.
 *
 * This deliberately lives in our own stroke language instead of delegating to an
 * avatar package: generated human faces turn a name into an accidental claim
 * about the person. These creatures stay in the same hand-drawn language as
 * the room emblems without resembling a particular human.
 */
export function MemberAvatar({
    name,
    avatar,
    size = 32,
    className,
}: {
    name: string
    /** The member's stored key. Null/undefined/unknown → name-derived persona. */
    avatar?: string | null
    size?: number
    className?: string
}) {
    const art = avatarArt(avatar, name)

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-n-1 bg-white',
                className
            )}
            style={{ width: size, height: size, background: art.background }}
            aria-hidden="true"
        >
            {art.kind === 'doodle' ? (
                // Inset, because a doodle is drawn to fill its 32-box edge to edge
                // and the circle would clip it. Personas own their internal inset.
                <Doodle name={art.doodle} size={Math.round(size * 0.62)} weight={2.2} />
            ) : (
                <PersonaGlyph art={art} size={size} />
            )}
        </span>
    )
}
