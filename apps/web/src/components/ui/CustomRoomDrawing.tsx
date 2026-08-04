import type { SVGProps } from 'react'
import { cn } from '@/lib/cn'
import { roomDrawingPathData, type RoomDrawing } from '@/lib/room-drawing'

interface CustomRoomDrawingProps extends Omit<
    SVGProps<SVGSVGElement>,
    'children' | 'fill' | 'stroke' | 'strokeWidth' | 'viewBox'
> {
    strokes: RoomDrawing
    /** Square SVG coordinate space. Pointer canvases use 1000; emblems use 32. */
    viewBoxSize?: number
    /** Stroke width in view-box units. */
    weight?: number
    /** Reads to a screen reader. Omit for decorative thumbnails. */
    label?: string
}

/**
 * The one renderer for somebody's room drawing.
 *
 * Geometry comes only from the strict room-drawing decoder and ink is fixed
 * here, so no stored value can introduce markup, colour, or SVG attributes.
 */
export function CustomRoomDrawing({
    strokes,
    viewBoxSize = 32,
    weight = 2.2,
    label,
    className,
    style,
    ...props
}: CustomRoomDrawingProps) {
    return (
        <svg
            {...props}
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            fill="none"
            stroke="#211c17"
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={cn('shrink-0 overflow-visible', className)}
            style={{ ...style, fill: 'none', stroke: '#211c17' }}
        >
            <path d={roomDrawingPathData(strokes, viewBoxSize)} />
        </svg>
    )
}

export default CustomRoomDrawing
