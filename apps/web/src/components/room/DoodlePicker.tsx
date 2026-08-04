'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { CustomRoomDrawing } from '@/components/ui/CustomRoomDrawing'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { decodeRoomDrawing, isRoomDrawing } from '@/lib/room-drawing'
import { RoomDrawingEditor } from './RoomDrawingEditor'

/**
 * The sixteen offered in the grid.
 *
 * A curated set beats the whole drawing library here: one tap, no search, and every one of these
 * is a thing groups actually split. The other thirty-five drawings are still reachable — they are
 * what `roomDoodleFor` picks from when it reads the room's name — so typing "Sushi in Shibuya"
 * gets you the nigiri even though nigiri is not on this grid. The grid is for overriding the
 * guess, not for browsing.
 *
 * The peanut leads because it is the fallback: whatever the name-reader could not place is
 * already showing the peanut, so the first tile is where the eye already is.
 */
export const ROOM_DOODLES = [
    'peanut',
    'mountain',
    'island',
    'pizza',
    'beer',
    'house',
    'van',
    'ski',
    'party',
    'cart',
    'plane',
    'guitar',
    'tent',
    'noodles',
    'boat',
    'cake',
] as const satisfies readonly DoodleName[]

export function DoodlePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const t = useTranslations('room.create')
    const [drawingOpen, setDrawingOpen] = useState(false)
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
    const customSelected = isRoomDrawing(value)
    const customStrokes = customSelected ? (decodeRoomDrawing(value) ?? []) : []
    const selectedDoodleIndex = ROOM_DOODLES.findIndex((name) => name === value)
    const selectedIndex = customSelected ? ROOM_DOODLES.length : selectedDoodleIndex
    const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex
    const optionCount = ROOM_DOODLES.length + 1

    /**
     * Buttons with radio roles do not inherit native radio keyboard behaviour.
     * Keep one option in the page's Tab order, then make the radio-group keys
     * move both focus and selection (including wrapping at either end).
     */
    const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
        const { key } = event
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return

        event.preventDefault()
        const nextIndex =
            key === 'Home'
                ? 0
                : key === 'End'
                  ? optionCount - 1
                  : key === 'ArrowLeft' || key === 'ArrowUp'
                    ? (currentIndex - 1 + optionCount) % optionCount
                    : (currentIndex + 1) % optionCount
        optionRefs.current[nextIndex]?.focus()
        if (nextIndex === ROOM_DOODLES.length) {
            setDrawingOpen(true)
            return
        }
        onChange(ROOM_DOODLES[nextIndex])
    }

    return (
        <>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('emojiGroup')}>
                {ROOM_DOODLES.map((name, index) => {
                    const selected = name === value
                    return (
                        <button
                            key={name}
                            ref={(option) => {
                                optionRefs.current[index] = option
                            }}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={t('emojiOption', { emoji: name })}
                            data-doodle={name}
                            tabIndex={index === tabStopIndex ? 0 : -1}
                            onKeyDown={(event) => moveSelection(event, index)}
                            onClick={() => onChange(name)}
                            className={cn(
                                'flex size-11 items-center justify-center rounded-sm border border-n-1 transition-transform active:translate-y-[2px]',
                                selected ? 'shadow-4 bg-primary-1' : 'bg-white'
                            )}
                        >
                            <Doodle name={name} size={24} />
                        </button>
                    )
                })}
                <button
                    ref={(option) => {
                        optionRefs.current[ROOM_DOODLES.length] = option
                    }}
                    type="button"
                    role="radio"
                    aria-checked={customSelected}
                    aria-label={t('drawYourOwn')}
                    data-doodle="custom"
                    tabIndex={ROOM_DOODLES.length === tabStopIndex ? 0 : -1}
                    onKeyDown={(event) => moveSelection(event, ROOM_DOODLES.length)}
                    onClick={() => setDrawingOpen(true)}
                    className={cn(
                        'flex size-11 items-center justify-center rounded-sm border border-dashed border-n-1 bg-primary-2 transition-transform active:translate-y-[2px]',
                        customSelected && 'shadow-4 border-solid bg-primary-1'
                    )}
                >
                    {customStrokes.length ? (
                        <CustomRoomDrawing strokes={customStrokes} weight={1.6} className="size-8" />
                    ) : (
                        <Icon name="pencil" size={24} aria-hidden="true" />
                    )}
                </button>
            </div>
            <RoomDrawingEditor open={drawingOpen} value={value} onChange={onChange} onOpenChange={setDrawingOpen} />
        </>
    )
}
