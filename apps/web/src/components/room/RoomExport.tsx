'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { RoomState } from '@/lib/api-types'
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

export function RoomExport({ state }: { state: RoomState }) {
    const t = useTranslations('room.export')

    return (
        <section className="flex flex-col gap-3" aria-labelledby="room-export-title">
            <div>
                <h2 id="room-export-title" className="text-h8 uppercase tracking-wide text-grey-1">
                    {t('title')}
                </h2>
                <p className="mt-1 text-sm text-grey-1">{t('privacyWarning')}</p>
                <p className="mt-1 text-sm text-grey-1">{t('credentialNote')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    variant="stroke"
                    size="small"
                    className="justify-center"
                    onClick={() =>
                        download(roomCsv(state), exportFilename(state.room.name, 'csv'), 'text/csv;charset=utf-8')
                    }
                >
                    {t('csv')}
                </Button>
                <Button
                    type="button"
                    variant="stroke"
                    size="small"
                    className="justify-center"
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
    )
}
