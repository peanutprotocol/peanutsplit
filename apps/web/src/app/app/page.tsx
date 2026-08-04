import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { YourRooms } from '@/components/marketing/YourRooms'
import { RecentRoomAppEntry } from '@/components/pwa/RecentRoomAppEntry'
import { Doodle } from '@/components/ui/Doodle'

export const metadata: Metadata = {
    title: 'Split',
    description: 'Create a room or reopen one saved on this device.',
    alternates: { canonical: '/app' },
    robots: { index: false, follow: true },
}

/** The accountless operational home: actions and device-local rooms, with no marketing journey. */
export default async function AppHomePage({ searchParams }: { searchParams: Promise<{ manage?: string | string[] }> }) {
    const [tCreate, tFooter] = await Promise.all([getTranslations('room.create'), getTranslations('marketing.footer')])

    const fallback = (
        <main data-testid="app-home" className="mx-auto min-h-dvh w-full max-w-xl bg-background">
            <header className="border-b border-n-1 bg-primary-1 px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
                <h1 className="text-h4">Split</h1>
            </header>

            <nav aria-label="Split" className="grid gap-3 px-5 pt-6">
                <Link
                    href="/new"
                    data-testid="app-new-split"
                    className="btn btn-primary btn-shadow-primary-4 flex w-full items-center justify-center gap-2 text-h6 no-underline"
                >
                    {tCreate('title')}
                    <Doodle name="iconarrowright" size={22} weight={2.2} />
                </Link>
                <Link
                    href="/import"
                    data-testid="app-import"
                    className="btn btn-stroke flex w-full items-center justify-center text-sm font-bold no-underline"
                >
                    {tFooter('importLink')}
                </Link>
            </nav>

            <YourRooms surface="app" />
        </main>
    )

    const { manage } = await searchParams
    return manage === '1' ? fallback : <RecentRoomAppEntry>{fallback}</RecentRoomAppEntry>
}
