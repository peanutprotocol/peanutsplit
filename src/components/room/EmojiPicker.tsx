'use client'

import { twMerge } from 'tailwind-merge'

/**
 * A curated set beats an emoji keyboard here: one tap, no search, and every
 * option already looks right on the room card and in the OG unfurl.
 */
export const ROOM_EMOJIS = [
    '🥜',
    '🏔️',
    '🏝️',
    '🍕',
    '🍻',
    '🏠',
    '🚐',
    '🎿',
    '🎉',
    '🛒',
    '✈️',
    '🎸',
    '🏕️',
    '🍜',
    '⛵',
    '🎂',
] as const

export const randomRoomEmoji = (): string => ROOM_EMOJIS[Math.floor(Math.random() * ROOM_EMOJIS.length)]

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Room emoji">
            {ROOM_EMOJIS.map((emoji) => {
                const selected = emoji === value
                return (
                    <button
                        key={emoji}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Emoji ${emoji}`}
                        onClick={() => onChange(emoji)}
                        className={twMerge(
                            'flex size-11 items-center justify-center rounded-sm border border-n-1 text-h5 transition-transform active:translate-y-[2px]',
                            selected ? 'shadow-4 bg-primary-1' : 'bg-white'
                        )}
                    >
                        {emoji}
                    </button>
                )
            })}
        </div>
    )
}
