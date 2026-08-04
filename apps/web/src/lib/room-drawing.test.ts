import { describe, expect, it } from 'vitest'
import {
    decodeRoomDrawing,
    encodeRoomDrawing,
    isRoomDrawing,
    ROOM_DRAWING_MAX_LENGTH,
    ROOM_DRAWING_MAX_POINTS,
    ROOM_DRAWING_MAX_POINTS_PER_STROKE,
    ROOM_DRAWING_MAX_STROKES,
    ROOM_DRAWING_PREFIX,
    roomDrawingPathData,
    type RoomDrawing,
} from '@/lib/room-drawing'

describe('room drawing encoding', () => {
    it('round-trips normalized black-only geometry in a compact v1 value', () => {
        const drawing: RoomDrawing = [
            [
                { x: 0, y: 1 },
                { x: 0.5, y: 0.25 },
                { x: 1, y: 0 },
            ],
            [{ x: 0.1, y: 0.9 }],
        ]

        const encoded = encodeRoomDrawing(drawing)
        expect(encoded.startsWith(ROOM_DRAWING_PREFIX)).toBe(true)
        expect(encoded).toMatch(/^drawing:v1:[0-9a-z.,;]+$/)
        expect(encoded).not.toMatch(/color|black|#|\{|\[/)

        const decoded = decodeRoomDrawing(encoded)
        expect(decoded).not.toBeNull()
        expect(decoded?.[0][0]).toEqual({ x: 0, y: 1 })
        expect(decoded?.[0][1].x).toBeCloseTo(0.5, 3)
        expect(decoded?.[0][1].y).toBeCloseTo(0.25, 3)
        expect(decoded?.[1][0].x).toBeCloseTo(0.1, 3)
        expect(encodeRoomDrawing(decoded!)).toBe(encoded)
        expect(isRoomDrawing(encoded)).toBe(true)
    })

    it('drops empty gestures and adjacent points that quantize to the same pixel', () => {
        const encoded = encodeRoomDrawing([
            [],
            [
                { x: 0.5, y: 0.5 },
                { x: 0.50001, y: 0.50001 },
                { x: 1, y: 1 },
            ],
        ])

        expect(decodeRoomDrawing(encoded)?.[0]).toHaveLength(2)
    })

    it('samples dense input and always remains comfortably inside the storage limit', () => {
        const strokes: RoomDrawing = Array.from({ length: 80 }, (_, stroke) =>
            Array.from({ length: 300 }, (_, point) => ({
                x: point / 299,
                y: ((point * 17 + stroke * 31) % 300) / 299,
            }))
        )

        const encoded = encodeRoomDrawing(strokes)
        const decoded = decodeRoomDrawing(encoded)!
        const totalPoints = decoded.reduce((total, stroke) => total + stroke.length, 0)

        expect(decoded).toHaveLength(ROOM_DRAWING_MAX_STROKES)
        expect(totalPoints).toBeLessThanOrEqual(ROOM_DRAWING_MAX_POINTS)
        expect(decoded.every((stroke) => stroke.length <= ROOM_DRAWING_MAX_POINTS_PER_STROKE)).toBe(true)
        expect(encoded.length).toBeLessThanOrEqual(ROOM_DRAWING_MAX_LENGTH)
        expect(decoded[0][0]).toEqual({ x: 0, y: 0 })
        expect(decoded[0].at(-1)?.x).toBe(1)
    })

    it('rejects invalid encoder input instead of silently clamping it', () => {
        expect(() => encodeRoomDrawing([])).toThrow(RangeError)
        expect(() => encodeRoomDrawing([[]])).toThrow(RangeError)
        expect(() => encodeRoomDrawing([[{ x: -0.01, y: 0.5 }]])).toThrow(RangeError)
        expect(() => encodeRoomDrawing([[{ x: 0.5, y: Number.NaN }]])).toThrow(RangeError)
    })
})

describe('room drawing validation', () => {
    it.each([
        null,
        42,
        '',
        'drawing:v2:0.0',
        'drawing:v1:',
        'drawing:v1:0',
        'drawing:v1:0.0;',
        'drawing:v1:0.0,,1.1',
        'drawing:v1:00.0',
        'drawing:v1:zz.0',
        'drawing:v1:0.0,0.0',
        'drawing:v1:0.0#000',
    ])('rejects malformed or non-canonical value %j', (value) => {
        expect(decodeRoomDrawing(value)).toBeNull()
        expect(isRoomDrawing(value)).toBe(false)
    })

    it('rejects serialized and structural limit violations', () => {
        expect(decodeRoomDrawing(`${ROOM_DRAWING_PREFIX}${'0'.repeat(ROOM_DRAWING_MAX_LENGTH)}`)).toBeNull()

        const tooManyStrokes = Array.from(
            { length: ROOM_DRAWING_MAX_STROKES + 1 },
            (_, index) => `${index.toString(36)}.0`
        ).join(';')
        expect(decodeRoomDrawing(`${ROOM_DRAWING_PREFIX}${tooManyStrokes}`)).toBeNull()

        const tooManyPoints = Array.from(
            { length: ROOM_DRAWING_MAX_POINTS_PER_STROKE + 1 },
            (_, index) => `${(index % 36).toString(36)}.${Math.floor(index / 36).toString(36)}`
        ).join(',')
        expect(decodeRoomDrawing(`${ROOM_DRAWING_PREFIX}${tooManyPoints}`)).toBeNull()
    })
})

describe('roomDrawingPathData', () => {
    it('builds disconnected SVG subpaths in the default 100-square viewBox', () => {
        expect(
            roomDrawingPathData([
                [
                    { x: 0, y: 0.5 },
                    { x: 1, y: 1 },
                ],
                [{ x: 0.25, y: 0.75 }],
            ])
        ).toBe('M0 50 L100 100 M25 75 L25.001 75')
    })

    it('supports other square viewBox sizes and rejects invalid sizes', () => {
        expect(roomDrawingPathData([[{ x: 0.5, y: 0.25 }]], 200)).toBe('M100 50 L100.002 50')
        expect(() => roomDrawingPathData([], 0)).toThrow(RangeError)
    })
})
