'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { CustomRoomDrawing } from '@/components/ui/CustomRoomDrawing'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import {
    decodeRoomDrawing,
    encodeRoomDrawing,
    ROOM_DRAWING_MAX_POINTS,
    ROOM_DRAWING_MAX_POINTS_PER_STROKE,
    ROOM_DRAWING_MAX_STROKES,
    type RoomDrawing,
    type RoomDrawingPoint,
} from '@/lib/room-drawing'

interface RoomDrawingEditorProps {
    open: boolean
    value: string
    onChange: (value: string) => void
    onOpenChange: (open: boolean) => void
}

const DRAWING_SIZE = 1000

function pointForEvent(event: ReactPointerEvent<SVGSVGElement>): RoomDrawingPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
}

/**
 * A deliberately small editor: one black pen and just enough recovery to make
 * finger drawing forgiving. Draft strokes live here until "Use drawing", so
 * closing the sheet never changes the room's current choice.
 */
export function RoomDrawingEditor({ open, value, onChange, onOpenChange }: RoomDrawingEditorProps) {
    const t = useTranslations('room.create')
    const [strokes, setStrokes] = useState<RoomDrawing>([])
    const activePointer = useRef<number | null>(null)

    useEffect(() => {
        if (!open) return
        setStrokes(decodeRoomDrawing(value) ?? [])
        activePointer.current = null
    }, [open, value])

    const addPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
        const point = pointForEvent(event)
        setStrokes((current) => {
            const lastStroke = current.at(-1)
            if (!lastStroke) return current
            const lastPoint = lastStroke.at(-1)
            if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) return current
            const pointCount = current.reduce((total, stroke) => total + stroke.length, 0)
            if (lastStroke.length >= ROOM_DRAWING_MAX_POINTS_PER_STROKE || pointCount >= ROOM_DRAWING_MAX_POINTS) {
                return [...current.slice(0, -1), [...lastStroke.slice(0, -1), point]]
            }
            return [...current.slice(0, -1), [...lastStroke, point]]
        })
    }

    const startStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
        const pointCount = strokes.reduce((total, stroke) => total + stroke.length, 0)
        if (
            activePointer.current !== null ||
            !event.isPrimary ||
            (event.pointerType === 'mouse' && event.button !== 0) ||
            strokes.length >= ROOM_DRAWING_MAX_STROKES ||
            pointCount >= ROOM_DRAWING_MAX_POINTS
        ) {
            return
        }
        event.preventDefault()
        // Vaul also listens to pointer gestures so the sheet can be dragged
        // closed. A drawing gesture belongs wholly to the canvas.
        event.stopPropagation()
        activePointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        // React clears a synthetic event's `currentTarget` after this handler;
        // capture the geometry before entering the state updater.
        const point = pointForEvent(event)
        setStrokes((current) => [...current, [point]])
    }

    const continueStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (activePointer.current !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        addPoint(event)
    }

    const finishStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (activePointer.current !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        addPoint(event)
        activePointer.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }

    const stopDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (activePointer.current === event.pointerId) activePointer.current = null
    }

    const close = () => onOpenChange(false)
    const useDrawing = () => {
        if (!strokes.length) return
        onChange(encodeRoomDrawing(strokes))
        close()
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent data-testid="custom-room-drawing-editor">
                <DrawerHeader className="flex flex-row items-end justify-between">
                    <DrawerTitle className="text-h5">{t('drawTitle')}</DrawerTitle>
                    <CloseButton onClick={close} label={t('drawCancel')} />
                </DrawerHeader>
                <DrawerBody className="gap-4">
                    <p id="room-drawing-hint" className="text-sm text-grey-1">
                        {t('drawHint')}
                    </p>
                    <div
                        data-vaul-no-drag
                        className="shadow-4 mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                    >
                        <CustomRoomDrawing
                            strokes={strokes}
                            viewBoxSize={DRAWING_SIZE}
                            weight={32}
                            label={t('drawTitle')}
                            aria-describedby="room-drawing-hint"
                            className="block size-full cursor-crosshair touch-none"
                            onPointerDown={startStroke}
                            onPointerMove={continueStroke}
                            onPointerUp={finishStroke}
                            onPointerCancel={stopDrawing}
                            onLostPointerCapture={stopDrawing}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            type="button"
                            variant="stroke"
                            size="medium"
                            icon="undo"
                            disabled={!strokes.length}
                            onClick={() => setStrokes((current) => current.slice(0, -1))}
                            className="justify-center"
                        >
                            {t('drawUndo')}
                        </Button>
                        <Button
                            type="button"
                            variant="stroke"
                            size="medium"
                            icon="trash"
                            disabled={!strokes.length}
                            onClick={() => setStrokes([])}
                            className="justify-center"
                        >
                            {t('drawClear')}
                        </Button>
                    </div>

                    <DrawerActions>
                        <Button
                            type="button"
                            variant="primary"
                            shadowSize="4"
                            disabled={!strokes.length}
                            onClick={useDrawing}
                            className="justify-center"
                        >
                            {t('drawUse')}
                        </Button>
                        <Button type="button" variant="stroke" onClick={close} className="justify-center">
                            {t('drawCancel')}
                        </Button>
                    </DrawerActions>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
