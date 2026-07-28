'use client'

import { cn } from '@/lib/cn'

const BACKGROUNDS = ['#FAE184', '#FFF4CC', '#B8F0C5', '#C9D3F3', '#F6C7EC'] as const

const seedOf = (name: string) => [...name].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0)

const HAIR = [
    'M8 13C8.2 8.1 11.1 5.1 16.2 5.3C21.7 5.4 24 9 24 13C21.6 11.7 19.4 9.8 17.9 7.6C15.6 10.2 12.4 11.9 8 13Z',
    'M8.4 13.2C8.6 8 11.2 5.4 16.1 5.4C20.6 5.4 23.5 7.9 23.8 12.7C21.8 10.4 19.4 9.2 16.7 9.1C13.8 9.1 11.5 10.4 8.4 13.2Z',
    'M8.2 12.9C8.7 8 11.1 5.5 15.9 5.4C20.8 5.3 23.5 8.2 23.8 12.8C21.4 11.5 19.9 9 19.4 7.2C17.4 9.9 14.1 11.3 8.2 12.9Z',
] as const

/**
 * Deterministic per-name doodle portrait.
 *
 * This deliberately lives in our own stroke language instead of delegating to
 * an avatar package: a geometric generated face was still a foreign icon in
 * otherwise hand-drawn chrome. Same name, same little portrait, every device.
 */
export function MemberAvatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
    const seed = seedOf(name)
    const hair = HAIR[seed % HAIR.length]
    const background = BACKGROUNDS[seed % BACKGROUNDS.length]
    const smile = seed % 2 === 0 ? 'M12.5 21.2C14.4 22.7 17.5 22.8 19.6 21' : 'M12.7 21C14.6 22 17.1 22.1 19.3 20.8'

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-n-1 bg-white',
                className
            )}
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            <svg
                viewBox="0 0 32 32"
                width={size}
                height={size}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.55"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ background }}
            >
                <path
                    d="M8.6 14.4C8.6 8.6 11.2 5.5 16 5.5C20.9 5.5 23.5 8.8 23.5 14.5V17.2C23.5 23 20.6 26.4 16 26.4C11.4 26.4 8.6 23.1 8.6 17.2Z"
                    fill="#FFFDF8"
                />
                <path d={hair} fill="currentColor" />
                <path d="M11.6 16.4C12.2 16 13 16 13.6 16.4M18.5 16.4C19.1 16 20 16 20.6 16.4" />
                <path d="M16.1 16.8C15.8 18.1 15.6 19.1 15.8 19.5C16.1 19.8 16.6 19.8 17 19.7" />
                <path d={smile} />
                <path d="M8.7 14.8C7.6 14.6 7 15.3 7.1 16.5C7.2 17.5 7.8 18.2 8.7 18.3M23.4 14.8C24.5 14.6 25 15.3 24.9 16.5C24.8 17.5 24.3 18.2 23.4 18.3" />
            </svg>
        </span>
    )
}
