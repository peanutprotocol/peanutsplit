'use client'

import { NativeEntry } from '@/lib/native/NativeEntry'

/** The app's root: decides the first screen. Renders nothing; the splash is still up. */
export default function NativeRootPage() {
    return <NativeEntry />
}
