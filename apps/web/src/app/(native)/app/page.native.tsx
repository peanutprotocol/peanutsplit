'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { YourRooms } from '@/components/marketing/YourRooms'
import { RecentRoomAppEntry } from '@/components/pwa/RecentRoomAppEntry'
import { Doodle } from '@/components/ui/Doodle'
import { buttonClassName } from '@/components/ui/button-style'
import { productUrl } from '@/lib/site'

/**
 * The app's rooms home: a client copy of (product-shell)/app/page.tsx without the install
 * surfaces (no install=1 branch, no CanonicalAppLaunchMarker) and without the landing link, whose
 * marketing page is not in the binary. Same test ids. `manage=1` shows the list without the
 * redirect to the recent room: the offline error, RoomSwitcher and leaving a room link here.
 */
function AppHome() {
    const tCreate = useTranslations('room.create')
    const tFooter = useTranslations('marketing.footer')
    const tRooms = useTranslations('marketing.rooms')
    const tHeader = useTranslations('room.header')
    const tLegal = useTranslations('legal')
    const searchParams = useSearchParams()
    const addExpense = searchParams.get('add') === '1'

    const home = (
        <main data-testid="app-home" className="split-app-frame mx-auto min-h-dvh w-full max-w-xl bg-background">
            <header className="flex items-center justify-between gap-3 border-b border-n-1 bg-primary-1 px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
                <h1 className="text-h4">{tRooms('title')}</h1>
            </header>

            <div className="px-5 pt-6">
                <a
                    href="#room-options"
                    data-testid="app-add-or-join"
                    className={buttonClassName({ shadowSize: '4', className: 'justify-center text-h6 no-underline' })}
                >
                    {tHeader('addOrJoinRoom')}
                </a>
            </div>
            <YourRooms
                surface="app"
                addExpense={addExpense}
                entryActions={
                    <nav aria-label={tHeader('addOrJoinRoom')} className="mb-5 grid gap-3">
                        <Link
                            href="/new/"
                            data-testid="app-new-split"
                            className={buttonClassName({
                                shadowSize: '4',
                                className: 'justify-center text-h6 no-underline',
                            })}
                        >
                            {tCreate('title')}
                            <Doodle name="iconarrowright" size={22} weight={2.2} />
                        </Link>
                        <Link
                            href="/import/"
                            data-testid="app-import"
                            className={buttonClassName({
                                variant: 'stroke',
                                className: 'justify-center text-sm font-bold no-underline',
                            })}
                        >
                            {tFooter('importLink')}
                        </Link>
                    </nav>
                }
            />
            {/* Both stores require a privacy link in the app (no Terms link in v1). The external-link
            handler opens it in the system browser. */}
            <footer className="px-5 pb-8 text-center text-sm text-grey-1">
                <a href={productUrl('/privacy')} className="underline" data-testid="app-privacy-link">
                    {tLegal('privacy')}
                </a>
            </footer>
        </main>
    )

    return searchParams.get('manage') === '1' ? (
        home
    ) : (
        <RecentRoomAppEntry addExpense={addExpense}>{home}</RecentRoomAppEntry>
    )
}

export default function NativeAppHomePage() {
    return (
        <Suspense fallback={null}>
            <AppHome />
        </Suspense>
    )
}
