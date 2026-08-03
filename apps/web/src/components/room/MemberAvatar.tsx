'use client'

import { Doodle } from '@/components/ui/Doodle'
import { avatarPalette, avatarPaletteForIdentity, isAvatarPaletteKey } from '@/lib/avatar-palettes'
import { avatarArt } from '@/lib/avatars'
import { cn } from '@/lib/cn'

/**
 * A member's little alter ego.
 *
 * Every identity uses the approved pop palette: a crisp dark coloured line,
 * close-cropped on a bright flat ground. Null and unknown values use one neutral
 * peanut while legacy rows are backfilled; colour is deterministic until a
 * stored palette is supplied.
 *
 * No generated human face can turn a name into an accidental claim about the
 * person. The result stays legible down to the tiny header treatment.
 */
export function MemberAvatar({
    name,
    avatar,
    palette,
    size = 32,
    className,
}: {
    name: string
    /** Null/undefined/unknown → neutral compatibility fallback. */
    avatar?: string | null
    /** Optional allowlisted palette key; invalid/missing values use a stable compatibility colour. */
    palette?: string | null
    size?: number
    className?: string
}) {
    const art = avatarArt(avatar, name)
    const colors = isAvatarPaletteKey(palette) ? avatarPalette(palette) : avatarPaletteForIdentity(avatar ?? name)
    const compact = size <= 24

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-n-1 bg-white',
                className
            )}
            style={{ width: size, height: size, background: colors.background, color: colors.ink }}
            aria-hidden="true"
        >
            <Doodle name={art.doodle} size={size * 1.04} weight={compact ? 2.05 : 2.15} className="max-w-none" />
        </span>
    )
}
