import { Doodle } from '@/components/ui/Doodle'
import { cn } from '@/lib/cn'
import { emblemDoodle } from '@/lib/room-emblem'
import { FALLBACK_DOODLE } from '@/lib/room-doodle'

interface RoomEmblemProps {
    /** The room's stored emblem: a doodle name, an emoji character, or nothing. */
    value: string | null | undefined
    /** Rendered size in px. The emoji branch matches it with a font size. */
    size?: number
    className?: string
}

/**
 * A room's emblem, drawn or typed.
 *
 * Every surface that shows a room — the header, the recent list, the link hand-off, the recap —
 * goes through here, so the "is it a doodle or an emoji" question is answered in exactly one
 * place. Before this, four components each wrote `{room.emoji || '🥜'}` and each would have
 * needed the same fix.
 *
 * A room with no emblem at all gets the peanut DRAWN rather than the peanut emoji it used to
 * get: an empty room should look like it belongs to this app, and 🥜 renders in whatever the
 * device's emoji font decided, which on Android is a different peanut entirely.
 */
export function RoomEmblem({ value, size = 28, className }: RoomEmblemProps) {
    const doodle = emblemDoodle(value)

    if (doodle || !value) {
        return <Doodle name={doodle ?? FALLBACK_DOODLE} size={size} className={className} />
    }

    // A legacy emoji. `lineHeight: 1` because an emoji glyph's own line box is taller than the
    // character, which would otherwise push it off-centre in a fixed-size tile.
    return (
        <span aria-hidden className={cn('inline-block shrink-0', className)} style={{ fontSize: size, lineHeight: 1 }}>
            {value}
        </span>
    )
}

export default RoomEmblem
