import { Doodle } from '@/components/ui/Doodle'
import { CustomRoomDrawing } from '@/components/ui/CustomRoomDrawing'
import { roomEmblemDoodle } from '@/lib/room-emblem'
import { decodeRoomDrawing } from '@/lib/room-drawing'

interface RoomEmblemProps {
    /** The room's stored emblem: a doodle name, an emoji character, or nothing. */
    value: string | null | undefined
    /** The room's name, which is what an unset emblem follows. */
    name: string
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
 * A room with no emblem stored follows its NAME, which is the rule the create form has always
 * used while somebody types. A name nothing recognises lands on the peanut DRAWN rather than the
 * peanut emoji it used to get: an empty room should look like it belongs to this app, and 🥜
 * renders in whatever the device's emoji font decided, which on Android is a different peanut
 * entirely.
 */
export function RoomEmblem({ value, name, size = 28, className }: RoomEmblemProps) {
    const drawing = decodeRoomDrawing(value)
    if (drawing) {
        return <CustomRoomDrawing strokes={drawing} width={size} height={size} className={className} />
    }
    return <Doodle name={roomEmblemDoodle(value, name)} size={size} className={className} />
}

export default RoomEmblem
