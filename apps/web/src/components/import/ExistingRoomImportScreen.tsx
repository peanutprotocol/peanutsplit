'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SplitwiseImport } from '@/components/import/SplitwiseImport'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { RoomNotFound } from '@/components/room/RoomStates'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import { importedRoomPath } from '@/lib/import-routes'
import { isCatalogCode } from '@/lib/money'
import { useRoomSnapshot } from '@/lib/queries'
import { themeVars } from '@/lib/themes'
import { useRoomIdentity } from '@/lib/use-identity'

export function ExistingRoomImportScreen({ slug }: { slug: string }) {
    const t = useTranslations('import.existing')
    const { data: state, error, isPending, refetch } = useRoomSnapshot(slug)
    const { identity } = useRoomIdentity(slug)

    if (isApiError(error, 'NOT_FOUND')) return <RoomNotFound slug={slug} />

    if (error && !state) {
        return (
            <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background px-4 py-8">
                <p className="text-h5">{t('loadFailed')}</p>
                <div className="mt-5 flex flex-col gap-3">
                    <Button variant="primary" shadowSize="4" className="justify-center" onClick={() => void refetch()}>
                        {t('tryAgain')}
                    </Button>
                    <Link
                        href={importedRoomPath(slug)}
                        className="flex min-h-11 items-center justify-center text-sm font-bold underline"
                    >
                        {t('backToRoom')}
                    </Link>
                </div>
            </main>
        )
    }

    if (isPending || !state) {
        return (
            <main
                className="mx-auto flex min-h-dvh w-full max-w-xl animate-pulse flex-col gap-5 bg-background px-4 py-8"
                aria-hidden="true"
                data-testid="import-room-skeleton"
            >
                <div className="h-11 w-32 rounded-sm bg-n-4" />
                <div className="h-20 rounded-sm border border-n-4 bg-white" />
                <div className="h-56 rounded-sm border border-n-4 bg-white" />
            </main>
        )
    }

    return (
        <main
            style={themeVars(state.room.theme) as React.CSSProperties}
            data-theme={state.room.theme ?? 'classic'}
            className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background px-4 py-8"
        >
            <Link
                href={importedRoomPath(slug)}
                className="mb-6 flex min-h-11 items-center self-start pr-4 text-sm font-bold text-n-1"
            >
                <Icon name="arrow-left" size={18} aria-hidden="true" className="mr-2" />
                {t('backToRoom')}
            </Link>

            <header className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white">
                    <RoomEmblem value={state.room.emoji} name={state.room.name} size={30} />
                </span>
                <div className="min-w-0">
                    <h1 className="truncate text-h5">{t('pageTitle', { room: state.room.name })}</h1>
                    <p className="mt-1 text-sm text-grey-1">{t('pageSubtitle')}</p>
                </div>
            </header>

            {!isCatalogCode(state.room.currency) ? (
                <section
                    className="bg-yellow-1 mt-6 rounded-sm border border-n-1 p-5"
                    role="alert"
                    data-testid="import-custom-currency-unsupported"
                >
                    <h2 className="text-h6">{t('customCurrencyUnsupportedTitle')}</h2>
                    <p className="mt-2 text-sm leading-5 text-n-1">
                        {t('customCurrencyUnsupportedBody', { currency: state.room.currency })}
                    </p>
                </section>
            ) : (
                <section className="mt-6">
                    <SplitwiseImport targetRoom={{ state, memberToken: identity?.token }} />
                </section>
            )}
        </main>
    )
}
