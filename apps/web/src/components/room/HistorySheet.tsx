'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import type { ApiRoomHistoryEvent } from '@/lib/api-types'
import { useRoomHistory } from '@/lib/queries'

const structured = (event: ApiRoomHistoryEvent) => ({
    subject: { type: event.subjectType, id: event.subjectId },
    before: event.before,
    after: event.after,
    detail: event.detail,
})

export function HistorySheet({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string }) {
    const t = useTranslations('room.history')
    const locale = useLocale()
    const history = useRoomHistory(slug, open)
    const events = history.data?.pages.flatMap((page) => page.events) ?? []

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
                    {history.isPending ? (
                        <p className="text-sm text-grey-1">{t('loading')}</p>
                    ) : history.isError ? (
                        <div className="flex flex-col gap-3" role="alert">
                            <p className="text-sm font-bold text-error">{t('failed')}</p>
                            <Button variant="stroke" onClick={() => void history.refetch()} className="justify-center">
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
                            className="mt-3 justify-center"
                            data-testid="history-load-older"
                        >
                            {t('loadOlder')}
                        </Button>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
