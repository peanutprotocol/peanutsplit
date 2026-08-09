'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import type { ApiRoomHistoryEvent, RoomState } from '@/lib/api-types'
import { useRoomHistory } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { HistoryStats } from './HistoryStats'

const structured = (event: ApiRoomHistoryEvent) => ({
    subject: { type: event.subjectType, id: event.subjectId },
    before: event.before,
    after: event.after,
    detail: event.detail,
})

const filenameFrom = (response: Response): string => {
    const disposition = response.headers.get('Content-Disposition')
    const headerName = disposition?.match(/filename="([^"]+)"/i)?.[1]
    const safeName = headerName?.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    return safeName?.endsWith('.json') ? safeName : 'room-history.json'
}

export function HistorySheet({
    open,
    onClose,
    slug,
    state,
}: {
    open: boolean
    onClose: () => void
    slug: string
    state: RoomState
}) {
    const t = useTranslations('room.history')
    const locale = useLocale()
    const history = useRoomHistory(slug, open)
    const events = history.data?.pages.flatMap((page) => page.events) ?? []
    const [downloading, setDownloading] = useState(false)
    const [downloadFailed, setDownloadFailed] = useState(false)

    const downloadHistory = async () => {
        setDownloading(true)
        setDownloadFailed(false)
        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}/history/export`)
            if (!response.ok) throw new Error(`History export failed with ${response.status}`)
            const href = URL.createObjectURL(await response.blob())
            const anchor = document.createElement('a')
            anchor.href = href
            anchor.download = filenameFrom(response)
            document.body.append(anchor)
            anchor.click()
            anchor.remove()
            // Firefox may still be consuming the object URL when click() returns.
            window.setTimeout(() => URL.revokeObjectURL(href), 0)
            toast.success(t('downloaded'), { duration: TOAST_MS.state })
        } catch {
            setDownloadFailed(true)
            toast.error(t('downloadFailed'), { duration: TOAST_MS.actionable })
        } finally {
            setDownloading(false)
        }
    }

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent data-testid="history-sheet">
                <DrawerHeader>
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <DrawerTitle className="text-h5">{t('title')}</DrawerTitle>
                            <p className="mt-1 text-sm text-grey-1">{t('intro')}</p>
                        </div>
                        <CloseButton onClick={onClose} label={t('close')} data-testid="close-history-sheet" />
                    </div>
                </DrawerHeader>
                <DrawerBody>
                    <HistoryStats state={state} />
                    <section
                        aria-labelledby="history-activity-title"
                        className="flex flex-col gap-3 border-t border-n-1 pt-5"
                    >
                        <h2 id="history-activity-title" className="text-h8 uppercase tracking-wide text-grey-1">
                            {t('activityTitle')}
                        </h2>
                        {history.isPending ? (
                            <p className="text-sm text-grey-1">{t('loading')}</p>
                        ) : history.isError ? (
                            <div className="flex flex-col gap-3" role="alert">
                                <p className="text-sm font-bold text-error">{t('failed')}</p>
                                <Button
                                    variant="stroke"
                                    onClick={() => void history.refetch()}
                                    className="justify-center"
                                >
                                    {t('retry')}
                                </Button>
                            </div>
                        ) : (
                            <ol className="flex flex-col gap-3" data-testid="history-list">
                                {events.map((event) => {
                                    const device = event.deviceLabel
                                        ? t('device', { label: event.deviceLabel })
                                        : t('unknownDevice')
                                    const action = t(`actions.${event.action}`)
                                    const actor = event.actorMemberName
                                        ? t('actor', { device, name: event.actorMemberName })
                                        : device
                                    return (
                                        <li key={event.id} className="rounded-sm border border-n-1 bg-white p-3">
                                            <time className="text-xs text-grey-1" dateTime={event.createdAt}>
                                                {new Intl.DateTimeFormat(locale, {
                                                    dateStyle: 'medium',
                                                    timeStyle: 'medium',
                                                }).format(new Date(event.createdAt))}
                                            </time>
                                            <p className="mt-1 text-sm font-bold">
                                                {event.action === 'history_started' ? action : `${actor} ${action}`}
                                            </p>
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide">
                                                    {t('structuredData')}
                                                </summary>
                                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-sm bg-background p-2 text-xs">
                                                    {JSON.stringify(structured(event), null, 2)}
                                                </pre>
                                            </details>
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                        {history.hasNextPage && (
                            <Button
                                variant="stroke"
                                onClick={() => void history.fetchNextPage()}
                                loading={history.isFetchingNextPage}
                                className="justify-center"
                                data-testid="history-load-older"
                            >
                                {t('loadOlder')}
                            </Button>
                        )}
                    </section>
                </DrawerBody>
                <DrawerActions className="border-t border-n-1 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <p id="history-download-hint" className="text-xs text-grey-1">
                        {t('downloadHint')}
                    </p>
                    {downloadFailed && (
                        <p className="text-xs font-bold text-error" role="alert">
                            {t('downloadFailed')}
                        </p>
                    )}
                    <Button
                        type="button"
                        variant="stroke"
                        icon="receipt"
                        className="justify-center"
                        loading={downloading}
                        aria-describedby="history-download-hint"
                        onClick={() => void downloadHistory()}
                        data-testid="history-download"
                    >
                        {downloading ? t('downloading') : t('download')}
                    </Button>
                </DrawerActions>
            </DrawerContent>
        </Drawer>
    )
}
