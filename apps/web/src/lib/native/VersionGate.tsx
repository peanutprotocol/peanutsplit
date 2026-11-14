'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { buttonClassName } from '@/components/ui/button-style'
import { loadHost } from './host'
import { gateFallbackUrl, subscribeVersionGate } from './version-gate'

function openInBrowser(url: string): void {
    void loadHost()?.then((host) => host.browser.open(url))
}

/**
 * Shows the update screen instead of `children` when this build is below the configured minimum
 * (ARCHITECTURE 11). The screen offers the store and, under it, the same room on the web, so a
 * person who cannot update yet still reaches their room.
 */
export function VersionGate({ children }: { children: React.ReactNode }) {
    const t = useTranslations('native.update')
    const [storeUrl, setStoreUrl] = useState<string | null>(null)

    useEffect(() => subscribeVersionGate(setStoreUrl), [])

    if (!storeUrl) return <>{children}</>
    return (
        <main className="grid min-h-dvh place-items-center bg-grey-3 px-4 py-10" data-testid="version-gate">
            <section className="shadow-2 w-full max-w-md rounded-sm border border-n-1 bg-white p-6 sm:p-8">
                <h1 className="text-h5">{t('title')}</h1>
                <p className="mt-3 text-sm leading-6 text-grey-1">{t('body')}</p>
                <div className="mt-5 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openInBrowser(storeUrl)}
                        className={buttonClassName({ shadowSize: '4', className: 'justify-center' })}
                    >
                        {t('cta')}
                    </button>
                    <button
                        type="button"
                        onClick={() => openInBrowser(gateFallbackUrl(location.pathname, location.search))}
                        className="min-h-11 px-2 py-3 text-sm font-bold text-grey-1 underline decoration-2 underline-offset-4"
                    >
                        {t('openWeb')}
                    </button>
                </div>
            </section>
        </main>
    )
}
