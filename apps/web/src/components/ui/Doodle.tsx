import { type SVGProps } from 'react'
import { cn } from '@/lib/cn'
import { DOODLE, type DoodleName } from './doodles'

export interface DoodleProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: DoodleName
    size?: number
    /** In 32-box units, not pixels. Lower it for anything drawn large. */
    weight?: number
    /** Reads to a screen reader. Omit for decoration and the drawing goes silent. */
    label?: string
}

/**
 * One drawing from `doodles.ts`, inline.
 *
 * Inline and not an `<img>` for one reason: `stroke="currentColor"`. A doodle takes the ink of
 * whatever it sits in, so the same asset works on cream, on the yellow band, and inverted inside
 * a selected tile — where a file would need three copies and a rule about which to load.
 *
 * `weight` is in the 32-unit box's own units, so it scales with the drawing. The default is
 * tuned for the 20–40px band, which is every use in the app except a deliberate hero drawing;
 * those should pass something nearer 1.4, or the line reads as a marker rather than a pen.
 *
 * Not a client component and it must not become one — these render inside server components
 * (the read-more fold, the use-case cards) and are static markup with no behaviour.
 */
export function Doodle({ name, size = 28, weight = 2, label, className, style, ...props }: DoodleProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            // Hand-drawn strokes wander a little past the box they were drawn in; clipping them
            // shaves a flick off the odd drawing and reads as a rendering fault.
            className={cn('shrink-0 overflow-visible', className)}
            // Button variants carry a legacy `fill-*` utility for the Lucide
            // icons they used to render. Doodles are stroke-only, so keep the
            // path hollow even inside those buttons.
            style={{ ...style, fill: 'none' }}
            {...props}
        >
            <path d={DOODLE[name]} />
        </svg>
    )
}

export default Doodle
