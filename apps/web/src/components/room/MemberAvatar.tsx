'use client'

import { Doodle } from '@/components/ui/Doodle'
import { avatarArt } from '@/lib/avatars'
import { cn } from '@/lib/cn'

/**
 * A member's little alter ego.
 *
 * Every identity now uses the approved Peanut doodle language: colored ink,
 * a soft ground and one deliberately wonky accent blob. Null and unknown values
 * use one neutral peanut while legacy rows are backfilled; randomness happens
 * once when a member is written, never during rendering.
 *
 * No generated human face can turn a name into an accidental claim about the
 * person. The result stays legible down to the tiny header treatment.
 */
export function MemberAvatar({
    name,
    avatar,
    size = 32,
    className,
}: {
    name: string
    /** Null/undefined/unknown → neutral compatibility fallback. */
    avatar?: string | null
    size?: number
    className?: string
}) {
    const art = avatarArt(avatar, name)

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-n-1 bg-white',
                className
            )}
            style={{ width: size, height: size, background: art.background, color: art.ink }}
            aria-hidden="true"
        >
            <span
                className="absolute bottom-[5%] right-[4%] h-[46%] w-[46%] rotate-12 rounded-[44%_56%_60%_40%]"
                style={{ background: art.accent }}
            />
            <Doodle
                name={art.doodle}
                size={Math.round(size * (art.kind === 'persona' ? 0.88 : 0.72))}
                weight={art.kind === 'persona' ? 1.7 : 2.1}
                className="relative z-[1]"
            />
        </span>
    )
}
