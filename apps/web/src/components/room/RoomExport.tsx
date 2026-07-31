'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { BTN_SMALL } from '@/components/ui/control'
import type { RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { exportFilename, roomCsv, roomJson } from '@/lib/room-export'

function download(contents: string, filename: string, type: string) {
    const href = URL.createObjectURL(new Blob([contents], { type }))
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Firefox may still be consuming the object URL when click() returns.
    window.setTimeout(() => URL.revokeObjectURL(href), 0)
}

/**
 * A row that says what you would get, and a sheet that hands it over.
 *
 * The one sentence inside is a disclosure, not a hint: the file carries every
 * name and every line of the ledger, and anyone holding the room link can pull
 * it. It does NOT claim to be "the whole money history" — deleted records are
 * left out, so that sentence would be false.
 */
export function RoomExport({ state }: { state: RoomState }) {
    const t = useTranslations('room.export')
    const tHeader = useTranslations('room.header')
    const [open, setOpen] = useState(false)

    return (
        <>
            <SettingRow
                label={tHeader('export')}
                value={tHeader('exportFormats')}
                onClick={() => setOpen(true)}
                testId="export-row"
            />
            <Drawer open={open} onOpenChange={setOpen}>
                <DrawerContent className={drawerContentClass} data-testid="export-sheet">
                    <DrawerHeader className={cn(drawerHeaderClass, 'flex flex-row items-end justify-between')}>
                        <DrawerTitle className="text-h5">{tHeader('export')}</DrawerTitle>
                        <CloseButton
                            onClick={() => setOpen(false)}
                            label={tHeader('closeSheet')}
                            data-testid="close-export-sheet"
                        />
                    </DrawerHeader>
                    <DrawerBody>
                        <p className="text-sm text-grey-1">{t('disclosure')}</p>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant="stroke"
                                size="small"
                                className={`${BTN_SMALL} justify-center`}
                                onClick={() =>
                                    download(
                                        roomCsv(state),
                                        exportFilename(state.room.name, 'csv'),
                                        'text/csv;charset=utf-8'
                                    )
                                }
                            >
                                {t('csv')}
                            </Button>
                            <Button
                                type="button"
                                variant="stroke"
                                size="small"
                                className={`${BTN_SMALL} justify-center`}
                                onClick={() =>
                                    download(
                                        roomJson(state),
                                        exportFilename(state.room.name, 'json'),
                                        'application/json;charset=utf-8'
                                    )
                                }
                            >
                                {t('json')}
                            </Button>
                        </div>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}
