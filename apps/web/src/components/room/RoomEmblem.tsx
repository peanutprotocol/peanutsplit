import { Doodle } from '@/components/ui/Doodle'
import { emblemDoodle } from '@/lib/room-emblem'
import { FALLBACK_DOODLE } from '@/lib/room-doodle'

interface RoomEmblemProps {
    /** The room's stored emblem: a doodle name, an emoji character, or nothing. */
    value: string | null | undefined
    /** Rendered size in px. */
    size?: number
    className?: string
}

/**
 * A room's emblem, always drawn.
 *
 * Every surface that shows a room — the header, the recent list, the link hand-off, the recap —
 * goes through here, so the "is it a doodle or an emoji" question is answered in exactly one
 * place. Legacy stored emoji are translated to their original picker meaning
 * at render time; unknown old values get the peanut fallback rather than
 * leaking the device's emoji font into otherwise drawn chrome.
 *
 * A room with no emblem at all gets the peanut DRAWN rather than the peanut emoji it used to
 * get: an empty room should look like it belongs to this app, and 🥜 renders in whatever the
 * device's emoji font decided, which on Android is a different peanut entirely.
 */
export function RoomEmblem({ value, size = 28, className }: RoomEmblemProps) {
    const doodle = emblemDoodle(value)

    return <Doodle name={doodle ?? FALLBACK_DOODLE} size={size} className={className} />
}

export default RoomEmblem
