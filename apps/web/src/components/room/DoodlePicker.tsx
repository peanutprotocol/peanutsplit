'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CustomRoomDrawing } from '@/components/ui/CustomRoomDrawing'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { useRovingRadioGroup } from '@/components/ui/use-roving-radio-group'
import { cn } from '@/lib/cn'
import { decodeRoomDrawing, isRoomDrawing, type RoomDrawing } from '@/lib/room-drawing'
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

const DRAW_YOUR_OWN_PREVIEW: RoomDrawing = [
    [
        { x: 0.14, y: 0.64 },
        { x: 0.28, y: 0.36 },
        { x: 0.43, y: 0.62 },
        { x: 0.58, y: 0.32 },
        { x: 0.78, y: 0.57 },
    ],
]

interface DoodlePickerProps {
    value: string
    onChange: (value: string) => void
    /** Keyboard radios stay open so Arrow/Home/End can continue moving. */
    onKeyboardChange?: (value: string) => void
    /** Lets a containing picker keep itself mounted while the portaled editor is in use. */
    onDrawingOpenChange?: (open: boolean) => void
    disabled?: boolean
}

export function DoodlePicker({
    value,
    onChange,
    onKeyboardChange,
    onDrawingOpenChange,
    disabled = false,
}: DoodlePickerProps) {
    const t = useTranslations('room.create')
    const [drawingOpen, setDrawingOpen] = useState(false)
    const customSelected = isRoomDrawing(value)
    const customStrokes = customSelected ? (decodeRoomDrawing(value) ?? []) : []
    const selectedOption = ROOM_DOODLES.find((name) => name === value)
    const { getRadioProps } = useRovingRadioGroup({
        options: ROOM_DOODLES,
        value: selectedOption,
        disabled,
        onChange: (next) => {
            if (disabled) return false
            ;(onKeyboardChange ?? onChange)(next)
            return true
        },
    })

    const setEditorOpen = (open: boolean) => {
        setDrawingOpen(open)
        onDrawingOpenChange?.(open)
    }

    return (
        <>
            <div className="flex flex-col items-start gap-2">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('emojiGroup')}>
                    {ROOM_DOODLES.map((name) => {
                        const selected = name === value
                        return (
                            <button
                                key={name}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                {...getRadioProps(name)}
                                aria-disabled={disabled || undefined}
                                aria-label={t('emojiOption', { emoji: name })}
                                data-doodle={name}
                                onClick={() => !disabled && onChange(name)}
                                className={cn(
                                    'flex size-11 items-center justify-center rounded-sm border border-n-1 transition-transform active:translate-y-[2px]',
                                    selected ? 'shadow-4 bg-primary-1' : 'bg-white',
                                    disabled && 'opacity-50'
                                )}
                            >
                                <Doodle name={name} size={24} />
                            </button>
                        )
                    })}
                </div>
                {/* This opens an editor rather than selecting a preset. Keep it outside the
                    radiogroup so its separate tab stop and pressed state describe that action. */}
                <button
                    type="button"
                    aria-pressed={customSelected}
                    aria-disabled={disabled || undefined}
                    aria-label={t('drawYourOwn')}
                    data-doodle="custom"
                    onClick={() => !disabled && setEditorOpen(true)}
                    className={cn(
                        'flex size-11 items-center justify-center rounded-sm border border-dashed border-n-1 bg-primary-2 transition-transform active:translate-y-[2px]',
                        customSelected && 'shadow-4 border-solid bg-primary-1',
                        disabled && 'opacity-50'
                    )}
                >
                    {customStrokes.length ? (
                        <CustomRoomDrawing strokes={customStrokes} weight={1.6} className="size-8" />
                    ) : (
                        <CustomRoomDrawing
                            strokes={DRAW_YOUR_OWN_PREVIEW}
                            weight={2.8}
                            className="size-8"
                            aria-hidden="true"
                        />
                    )}
                </button>
            </div>
            <RoomDrawingEditor open={drawingOpen} value={value} onChange={onChange} onOpenChange={setEditorOpen} />
        </>
    )
}
