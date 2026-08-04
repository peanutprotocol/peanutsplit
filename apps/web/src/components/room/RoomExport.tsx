'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { BTN_SMALL } from '@/components/ui/control'
import type { RoomState } from '@/lib/api-types'
import { existingRoomImportPath } from '@/lib/import-routes'
import { isCatalogCode } from '@/lib/money'
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
    const tImport = useTranslations('import.existing')
    const router = useRouter()
    const [open, setOpen] = useState(false)
    // The browser parsers deliberately discard invented source currencies, so
    // a custom room has no file it can accept. Catalog targets remain available:
    // even an unrated code such as KPW can import rows already denominated in KPW.
    const importsSupported = isCatalogCode(state.room.currency)
    const headerTitle = importsSupported ? tHeader('importExport') : tHeader('exportOnly')
    const headerFormats = importsSupported ? tHeader('importExportFormats') : tHeader('exportFormats')

    return (
        <>
            <SettingRow label={headerTitle} value={headerFormats} onClick={() => setOpen(true)} testId="export-row" />
            <Drawer open={open} onOpenChange={setOpen}>
                <DrawerContent data-testid="export-sheet">
                    <DrawerHeader className="flex flex-row items-end justify-between">
                        <DrawerTitle className="text-h5">{headerTitle}</DrawerTitle>
                        <CloseButton
                            onClick={() => setOpen(false)}
                            label={tHeader('closeSheet')}
                            data-testid="close-export-sheet"
                        />
                    </DrawerHeader>
                    <DrawerBody>
                        <section className="flex flex-col gap-3">
                            <h2 className="text-h7">
                                {importsSupported ? t('importTitle') : tImport('customCurrencyUnsupportedTitle')}
                            </h2>
                            <p className="text-sm leading-5 text-grey-1">
                                {importsSupported
                                    ? t('importBody')
                                    : tImport('customCurrencyUnsupportedBody', { currency: state.room.currency })}
                            </p>
                            {importsSupported && (
                                <Button
                                    type="button"
                                    variant="primary"
                                    shadowSize="4"
                                    className="justify-center"
                                    data-testid="open-splitwise-import"
                                    onClick={() => {
                                        setOpen(false)
                                        // The slug is the room credential. Keep it in the already-redacted
                                        // `/r/...` path rather than leaking it through a marketing-page query.
                                        router.push(existingRoomImportPath(state.room.slug))
                                    }}
                                >
                                    {t('openImporter')}
                                </Button>
                            )}
                        </section>

                        <section className="flex flex-col gap-3 border-t border-n-1 pt-5">
                            <h2 className="text-h7">{t('exportTitle')}</h2>
                            <p className="text-sm leading-5 text-grey-1">{t('disclosure')}</p>
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
                        </section>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}
