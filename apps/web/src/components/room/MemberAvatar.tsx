'use client'

import { Doodle } from '@/components/ui/Doodle'
import { avatarArt } from '@/lib/avatars'
import { cn } from '@/lib/cn'

/**
 * A member's little portrait.
 *
 * Two sources, one component. With no `avatar` the drawing is derived from the
 * name — same name, same face, every device — which is what every member had
 * before the picker existed and what a member who never opens it keeps. With an
 * avatar it draws the chosen one from `lib/avatars.ts`.
 *
 * This deliberately lives in our own stroke language instead of delegating to an
 * avatar package: a geometric generated face was still a foreign icon in
 * otherwise hand-drawn chrome. The doodle avatars come from the same pen as the
 * room emblems, so the two families sit together without a seam.
 */
export function MemberAvatar({
    name,
    avatar,
    size = 32,
    className,
}: {
    name: string
    /** The member's stored key. Null/undefined/unknown → the name-derived face. */
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
                // and the circle would clip it. The face below is drawn inside a
                // head that already sits away from the border.
                <Doodle name={art.doodle} size={Math.round(size * 0.62)} weight={2.2} />
            ) : (
                <svg
                    viewBox="0 0 32 32"
                    width={size}
                    height={size}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.55"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path
                        d="M8.6 14.4C8.6 8.6 11.2 5.5 16 5.5C20.9 5.5 23.5 8.8 23.5 14.5V17.2C23.5 23 20.6 26.4 16 26.4C11.4 26.4 8.6 23.1 8.6 17.2Z"
                        fill="#FFFDF8"
                    />
                    {art.hair && <path d={art.hair} fill="currentColor" />}
                    <path d="M11.6 16.4C12.2 16 13 16 13.6 16.4M18.5 16.4C19.1 16 20 16 20.6 16.4" />
                    <path d="M16.1 16.8C15.8 18.1 15.6 19.1 15.8 19.5C16.1 19.8 16.6 19.8 17 19.7" />
                    <path d={art.smile} />
                    <path d="M8.7 14.8C7.6 14.6 7 15.3 7.1 16.5C7.2 17.5 7.8 18.2 8.7 18.3M23.4 14.8C24.5 14.6 25 15.3 24.9 16.5C24.8 17.5 24.3 18.2 23.4 18.3" />
                </svg>
            )}
        </span>
    )
}
