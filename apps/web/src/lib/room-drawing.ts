/** A point in the drawing canvas. Both coordinates are normalized to the inclusive 0..1 range. */
export type RoomDrawingPoint = Readonly<{ x: number; y: number }>

/** One uninterrupted pointer gesture. Room drawings are always rendered in black. */
export type RoomDrawingStroke = readonly RoomDrawingPoint[]

/** The complete set of gestures that make up a custom room drawing. */
export type RoomDrawing = readonly RoomDrawingStroke[]

export const ROOM_DRAWING_PREFIX = 'drawing:v1:'
export const ROOM_DRAWING_MAX_LENGTH = 4096
export const ROOM_DRAWING_MAX_STROKES = 32
export const ROOM_DRAWING_MAX_POINTS_PER_STROKE = 128
export const ROOM_DRAWING_MAX_POINTS = 384

// 1,023 gives sub-pixel accuracy in the 100 x 100 SVG viewBox while still fitting in two base-36
// characters. The stored format is deliberately just geometry: there is no colour to validate or
// migrate, and all renderers can safely use the product's single black ink colour.
const COORDINATE_STEPS = 1023
const TOKEN_PATTERN = /^[0-9a-z]{1,2}$/
const BODY_PATTERN = /^[0-9a-z.,;]+$/

type QuantizedPoint = readonly [x: number, y: number]

function evenlySample<T>(values: readonly T[], limit: number): T[] {
    if (values.length <= limit) return [...values]
    if (limit === 1) return [values[0]]

    const sampled: T[] = []
    for (let index = 0; index < limit; index += 1) {
        sampled.push(values[Math.round((index * (values.length - 1)) / (limit - 1))])
    }
    return sampled
}

function quantize(point: RoomDrawingPoint): QuantizedPoint {
    if (
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
    ) {
        throw new RangeError('Room drawing coordinates must be finite numbers between 0 and 1')
    }
    return [Math.round(point.x * COORDINATE_STEPS), Math.round(point.y * COORDINATE_STEPS)]
}

function samePoint(left: QuantizedPoint, right: QuantizedPoint): boolean {
    return left[0] === right[0] && left[1] === right[1]
}

function normalizeForEncoding(strokes: RoomDrawing): QuantizedPoint[][] {
    if (!Array.isArray(strokes)) throw new TypeError('Room drawing strokes must be an array')

    // Validate before sampling so an invalid point cannot hide in the discarded part of a gesture.
    const quantized = strokes.map((stroke) => {
        if (!Array.isArray(stroke)) throw new TypeError('Each room drawing stroke must be an array')
        const points: QuantizedPoint[] = []
        for (const point of stroke) {
            const next = quantize(point)
            if (!points.length || !samePoint(points[points.length - 1], next)) points.push(next)
        }
        return points
    })

    const nonEmpty = quantized.filter((stroke) => stroke.length > 0)
    if (!nonEmpty.length) throw new RangeError('A room drawing must contain at least one point')

    const limitedStrokes = evenlySample(nonEmpty, ROOM_DRAWING_MAX_STROKES).map((stroke) =>
        evenlySample(stroke, ROOM_DRAWING_MAX_POINTS_PER_STROKE)
    )

    const pointCount = limitedStrokes.reduce((total, stroke) => total + stroke.length, 0)
    if (pointCount <= ROOM_DRAWING_MAX_POINTS) return limitedStrokes

    // Share the global point budget between gestures. Each gesture keeps at least one point and
    // longer gestures receive more points round-robin, rather than one long gesture consuming all
    // of the room drawing's storage allowance.
    const budgets = limitedStrokes.map(() => 1)
    let remaining = ROOM_DRAWING_MAX_POINTS - limitedStrokes.length
    while (remaining > 0) {
        let allocated = false
        for (let index = 0; index < limitedStrokes.length && remaining > 0; index += 1) {
            if (budgets[index] >= limitedStrokes[index].length) continue
            budgets[index] += 1
            remaining -= 1
            allocated = true
        }
        if (!allocated) break
    }

    return limitedStrokes.map((stroke, index) => evenlySample(stroke, budgets[index]))
}

function encodePoint(point: QuantizedPoint): string {
    return `${point[0].toString(36)}.${point[1].toString(36)}`
}

/**
 * Encodes normalized strokes as a compact, canonical database-safe string.
 *
 * Dense pointer input is sampled evenly while keeping gesture endpoints. Empty gestures and
 * duplicate adjacent pixels are discarded. Invalid coordinates are rejected instead of clamped,
 * because clamping malformed persisted input could silently change the drawing.
 */
export function encodeRoomDrawing(strokes: RoomDrawing): string {
    const normalized = normalizeForEncoding(strokes)
    const body = normalized.map((stroke) => stroke.map(encodePoint).join(',')).join(';')
    const encoded = `${ROOM_DRAWING_PREFIX}${body}`

    // This should be unreachable with the limits above. Keep the invariant next to the boundary
    // in case a future format change makes tokens wider.
    if (encoded.length > ROOM_DRAWING_MAX_LENGTH) {
        throw new RangeError('Room drawing exceeds the serialized size limit')
    }
    return encoded
}

function decodeCoordinate(token: string): number | null {
    if (!TOKEN_PATTERN.test(token) || (token.length > 1 && token.startsWith('0'))) return null
    const value = Number.parseInt(token, 36)
    return value <= COORDINATE_STEPS ? value : null
}

/**
 * Strictly decodes a v1 drawing, returning null for unsupported, non-canonical, or oversized data.
 */
export function decodeRoomDrawing(value: unknown): RoomDrawing | null {
    if (typeof value !== 'string' || value.length > ROOM_DRAWING_MAX_LENGTH || !value.startsWith(ROOM_DRAWING_PREFIX)) {
        return null
    }

    const body = value.slice(ROOM_DRAWING_PREFIX.length)
    if (!body || !BODY_PATTERN.test(body)) return null

    const encodedStrokes = body.split(';')
    if (encodedStrokes.length > ROOM_DRAWING_MAX_STROKES) return null

    const strokes: RoomDrawingPoint[][] = []
    let totalPoints = 0
    for (const encodedStroke of encodedStrokes) {
        const encodedPoints = encodedStroke.split(',')
        if (!encodedPoints.length || encodedPoints.length > ROOM_DRAWING_MAX_POINTS_PER_STROKE) return null
        totalPoints += encodedPoints.length
        if (totalPoints > ROOM_DRAWING_MAX_POINTS) return null

        const stroke: RoomDrawingPoint[] = []
        let previous: QuantizedPoint | null = null
        for (const encodedPoint of encodedPoints) {
            const parts = encodedPoint.split('.')
            if (parts.length !== 2) return null
            const x = decodeCoordinate(parts[0])
            const y = decodeCoordinate(parts[1])
            if (x === null || y === null) return null

            const quantized: QuantizedPoint = [x, y]
            // The encoder removes adjacent duplicates. Rejecting them keeps one canonical form and
            // prevents an attacker from spending the entire point allowance on zero-length data.
            if (previous && samePoint(previous, quantized)) return null
            previous = quantized
            stroke.push({ x: x / COORDINATE_STEPS, y: y / COORDINATE_STEPS })
        }
        strokes.push(stroke)
    }
    return strokes
}

/** True only for a complete, supported custom-room drawing value. */
export function isRoomDrawing(value: unknown): value is string {
    return decodeRoomDrawing(value) !== null
}

function svgNumber(value: number): string {
    const rounded = Math.round(value * 1000) / 1000
    return String(Object.is(rounded, -0) ? 0 : rounded)
}

/**
 * Converts strokes to one SVG path's `d` value in a square viewBox.
 *
 * The default viewBox is `0 0 100 100`. Callers own presentation (`stroke="black"`, no fill,
 * round caps/joins), keeping the persisted drawing itself permanently colour-free.
 */
export function roomDrawingPathData(strokes: RoomDrawing, size = 100): string {
    if (!Number.isFinite(size) || size <= 0) throw new RangeError('SVG drawing size must be positive')

    const commands: string[] = []
    for (const stroke of strokes) {
        if (!stroke.length) continue
        const [first, ...rest] = stroke
        const x = first.x * size
        const y = first.y * size
        commands.push(`M${svgNumber(x)} ${svgNumber(y)}`)

        if (!rest.length) {
            // A move command alone paints nothing. This near-zero segment becomes a round dot when
            // the path uses round linecaps, without being perceptible at any practical viewBox size.
            commands.push(`L${svgNumber(x + size / 100_000)} ${svgNumber(y)}`)
            continue
        }
        for (const point of rest) commands.push(`L${svgNumber(point.x * size)} ${svgNumber(point.y * size)}`)
    }
    return commands.join(' ')
}
