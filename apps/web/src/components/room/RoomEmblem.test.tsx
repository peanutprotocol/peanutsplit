import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { RoomEmblem } from './RoomEmblem'

describe('RoomEmblem', () => {
    it('renders a custom drawing as fixed black stroke geometry', () => {
        const value = encodeRoomDrawing([
            [
                { x: 0.1, y: 0.2 },
                { x: 0.9, y: 0.8 },
            ],
        ])
        const html = renderToStaticMarkup(<RoomEmblem value={value} name="Ski trip" size={30} />)

        expect(html).toContain('viewBox="0 0 32 32"')
        expect(html).toContain('stroke="#211c17"')
        expect(html).toContain('M3.191 6.413 L28.809 25.587')
        expect(html).not.toContain(value)
    })

    it('keeps the existing fallback for malformed stored drawings', () => {
        const html = renderToStaticMarkup(<RoomEmblem value="drawing:v1:not-valid" name="Ski trip" />)
        expect(html).toContain(DOODLE.peanut)
    })
})
