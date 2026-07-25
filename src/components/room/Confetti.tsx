'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/** Brand confetti only — yellow, pink and black. Anything else and it stops
 *  looking like Peanut and starts looking like a party-supplies website. */
const COLORS = ['#FFC900', '#FF90E8', '#000000', '#FFC900', '#98E9AB'] as const

const PIECES = 24

interface Piece {
    x: number
    y: number
    rotate: number
    delay: number
    duration: number
    color: string
    width: number
    height: number
}

/**
 * A confetti burst in ~40 lines, no dependency.
 *
 * Every piece is an absolutely-positioned rect launched from the centre on a
 * deterministic-per-mount trajectory, animating `transform` and `opacity` only
 * so the whole burst stays on the compositor. It is `pointer-events-none` and
 * `aria-hidden` — decoration that must never intercept a tap or reach a screen
 * reader.
 */
export function Confetti({ className }: { className?: string }) {
    const reduceMotion = useReducedMotion()

    const pieces = useMemo<Piece[]>(
        () =>
            Array.from({ length: PIECES }, (_, index) => {
                // Fan the pieces evenly around the circle, then jitter, so the
                // burst never leaves an empty quadrant the way pure random does.
                const angle = (index / PIECES) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
                const distance = 90 + Math.random() * 120
                return {
                    x: Math.cos(angle) * distance,
                    // Bias upward: things thrown in the air go up before they go out.
                    y: Math.sin(angle) * distance - 40,
                    rotate: (Math.random() - 0.5) * 540,
                    delay: Math.random() * 0.12,
                    duration: 0.9 + Math.random() * 0.5,
                    color: COLORS[index % COLORS.length],
                    width: 6 + Math.random() * 5,
                    height: 9 + Math.random() * 7,
                }
            }),
        []
    )

    if (reduceMotion) return null

    return (
        <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
            {pieces.map((piece, index) => (
                <motion.span
                    key={index}
                    className="absolute left-1/2 top-1/2 block rounded-[1px] border border-n-1"
                    style={{ width: piece.width, height: piece.height, backgroundColor: piece.color }}
                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 0, rotate: 0 }}
                    animate={{
                        x: piece.x,
                        // Two-stop y: up on the launch, then gravity takes it.
                        y: [0, piece.y, piece.y + 130],
                        scale: [0.4, 1, 0.9],
                        opacity: [0, 1, 0],
                        rotate: piece.rotate,
                    }}
                    transition={{
                        duration: piece.duration,
                        delay: piece.delay,
                        ease: [0.16, 0.72, 0.34, 1],
                        times: [0, 0.45, 1],
                    }}
                />
            ))}
        </div>
    )
}
