'use client'

import Avatar from 'boring-avatars'
import { cn } from '@/lib/cn'

/** Peanut-family palette — warm yellows, the lavender tint, and black ink so the
 *  avatars sit inside the design system instead of next to it. */
const PALETTE = ['#FFC900', '#FAE184', '#FFF4CC', '#98E9AB', '#90A8ED']

/**
 * Deterministic per-name avatar. Same person, same face, on every device — that
 * is the whole trust trick in a room with no accounts.
 */
export function MemberAvatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-n-1 bg-white',
                className
            )}
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            <Avatar size={size} name={name} variant="beam" colors={PALETTE} />
        </span>
    )
}
