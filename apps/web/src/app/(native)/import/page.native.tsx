'use client'

import { SplitwiseImport } from '@/components/import/SplitwiseImport'

/** The Splitwise import tool alone; the web page's marketing frame stays on the web. */
export default function NativeImportPage() {
    return (
        <main className="split-app-frame mx-auto min-h-dvh w-full max-w-xl bg-background px-4 py-6">
            <SplitwiseImport />
        </main>
    )
}
